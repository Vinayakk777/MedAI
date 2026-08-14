import { db, alertConfigsTable, alertEventsTable } from "@workspace/db";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import type { AlertConfigInput, AlertEventResult } from "./types";
import { logger } from "../logger";

export class AlertManager {
  async createConfig(input: AlertConfigInput): Promise<string> {
    const [saved] = await db.insert(alertConfigsTable).values({
      name: input.name,
      metric: input.metric,
      operator: input.operator,
      threshold: input.threshold,
      windowMinutes: input.windowMinutes ?? 60,
      cooldownMinutes: input.cooldownMinutes ?? 30,
      severity: input.severity ?? "warning",
      channels: input.channels ?? ["email"],
      enabled: input.enabled ?? true,
    }).returning();

    return saved.id;
  }

  async updateConfig(id: string, updates: Partial<AlertConfigInput>): Promise<void> {
    await db.update(alertConfigsTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(alertConfigsTable.id, id));
  }

  async getConfigs() {
    return db.select()
      .from(alertConfigsTable)
      .orderBy(desc(alertConfigsTable.createdAt));
  }

  async getConfig(id: string) {
    const [config] = await db.select()
      .from(alertConfigsTable)
      .where(eq(alertConfigsTable.id, id))
      .limit(1);
    return config || null;
  }

  async deleteConfig(id: string): Promise<void> {
    await db.delete(alertConfigsTable).where(eq(alertConfigsTable.id, id));
  }

  async evaluateAndFire(event: AlertEventResult): Promise<boolean> {
    // Check cooldown
    const [recent] = await db.select()
      .from(alertEventsTable)
      .where(and(
        eq(alertEventsTable.configId, event.configId),
        eq(alertEventsTable.metric, event.metric),
        gte(alertEventsTable.createdAt, new Date(Date.now() - 30 * 60 * 1000)),
      ))
      .orderBy(desc(alertEventsTable.createdAt))
      .limit(1);

    if (recent) return false; // still in cooldown

    const [saved] = await db.insert(alertEventsTable).values({
      configId: event.configId,
      metric: event.metric,
      metricValue: event.metricValue,
      threshold: event.threshold,
      severity: event.severity,
      message: event.message,
      details: event.details || {},
    }).returning();

    // Update last fired
    await db.update(alertConfigsTable)
      .set({ lastFiredAt: new Date() })
      .where(eq(alertConfigsTable.id, event.configId));

    // TODO: Dispatch to channels (email, slack, webhook, pagerduty)
    await this.dispatchAlert(event, saved.id);

    return true;
  }

  async getAlertHistory(limit = 50, offset = 0, severity?: string) {
    const conditions = severity ? [eq(alertEventsTable.severity, severity)] : [];

    return db.select()
      .from(alertEventsTable)
      .where(and(...conditions))
      .orderBy(desc(alertEventsTable.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async resolveAlert(alertId: string): Promise<void> {
    await db.update(alertEventsTable)
      .set({ isResolved: true, resolvedAt: new Date() })
      .where(eq(alertEventsTable.id, alertId));
  }

  async checkMetric(metric: string, currentValue: number): Promise<AlertEventResult[]> {
    const configs = await db.select()
      .from(alertConfigsTable)
      .where(and(
        eq(alertConfigsTable.metric, metric),
        eq(alertConfigsTable.enabled, true),
      ));

    const triggered: AlertEventResult[] = [];

    for (const config of configs) {
      const isTriggered = this.evaluateCondition(currentValue, config.operator as string, config.threshold);
      if (isTriggered) {
        triggered.push({
          configId: config.id,
          metric,
          metricValue: currentValue,
          threshold: config.threshold,
          severity: config.severity ?? "warning",
          message: `${config.name}: ${metric} is ${currentValue} (threshold: ${config.operator} ${config.threshold})`,
          details: { operator: config.operator },
        });
      }
    }

    return triggered;
  }

  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case "gt": return value > threshold;
      case "gte": return value >= threshold;
      case "lt": return value < threshold;
      case "lte": return value <= threshold;
      case "eq": return value === threshold;
      default: return false;
    }
  }

  private async dispatchAlert(event: AlertEventResult, alertId: string): Promise<void> {
    const log = logger.child({ alertId, metric: event.metric, severity: event.severity });
    log.info({ message: event.message }, "Alert triggered — dispatching to channels");

    const results = await Promise.allSettled([
      this.dispatchSlack(event, alertId),
      this.dispatchEmail(event, alertId),
      this.dispatchWebhook(event, alertId),
    ]);

    for (const result of results) {
      if (result.status === "rejected") {
        log.error({ err: result.reason }, "Alert dispatch channel failed");
      }
    }
  }

  private async dispatchSlack(event: AlertEventResult, alertId: string): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    const color = event.severity === "critical" ? "#dc2626"
      : event.severity === "high" ? "#f59e0b"
      : "#3b82f6";

    const payload = {
      attachments: [{
        color,
        blocks: [
          { type: "header", text: { type: "plain_text", text: `[${event.severity.toUpperCase()}] ${event.metric}` } },
          { type: "section", text: { type: "mrkdwn", text: event.message } },
          { type: "context", elements: [
            { type: "mrkdwn", text: `*Alert ID:* ${alertId} | *Value:* ${event.metricValue} | *Threshold:* ${(event.details as any)?.operator || "?"} ${event.threshold}` },
          ]},
        ],
      }],
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`);
  }

  private async dispatchEmail(event: AlertEventResult, alertId: string): Promise<void> {
    const to = process.env.ALERT_EMAIL_TO;
    if (!to) return;

    const subject = `[${event.severity.toUpperCase()}] Alert: ${event.metric}`;
    const body = [
      `Alert ID: ${alertId}`,
      `Severity: ${event.severity}`,
      `Metric: ${event.metric}`,
      `Current Value: ${event.metricValue}`,
      `Threshold: ${(event.details as any)?.operator || "?"} ${event.threshold}`,
      `Message: ${event.message}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join("\n");

    // Use SMTP if configured, otherwise fall back to logger
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const nodemailerMod: any = await import("nodemailer" as any);
        const transport = nodemailerMod.default?.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: process.env.SMTP_SECURE === "true",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        if (transport) await transport.sendMail({ from: process.env.SMTP_FROM || "alerts@medibot.local", to, subject, text: body });
      } catch {
        // SMTP unavailable — log instead
      }
    }

    logger.info({ alertId, to, subject }, "Alert email dispatched");
  }

  private async dispatchWebhook(event: AlertEventResult, alertId: string): Promise<void> {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    const payload = {
      id: alertId,
      severity: event.severity,
      metric: event.metric,
      value: event.metricValue,
      threshold: event.threshold,
      operator: (event.details as any)?.operator || "?",
      message: event.message,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Alert webhook returned ${res.status}`);
  }
}
