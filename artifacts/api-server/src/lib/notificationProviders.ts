import { logger } from "./logger";

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: "low" | "normal" | "high";
}

export interface NotificationResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export interface MedicationReminderProvider {
  sendMedicationReminder(payload: NotificationPayload): Promise<NotificationResult>;
  scheduleReminder(payload: NotificationPayload, scheduledAt: Date): Promise<NotificationResult>;
  cancelReminder(reminderId: string): Promise<NotificationResult>;
}

export interface FollowUpReminderProvider {
  sendFollowUpReminder(payload: NotificationPayload): Promise<NotificationResult>;
}

export interface ScreeningReminderProvider {
  sendScreeningReminder(payload: NotificationPayload): Promise<NotificationResult>;
}

export interface VaccinationReminderProvider {
  sendVaccinationReminder(payload: NotificationPayload): Promise<NotificationResult>;
}

export interface LifestyleReminderProvider {
  sendLifestyleReminder(payload: NotificationPayload): Promise<NotificationResult>;
}

// ─── Multi-channel Notification Dispatcher ───

async function dispatchToChannels(payload: NotificationPayload, channel: string): Promise<NotificationResult> {
  const log = logger.child({ userId: payload.userId, channel, title: payload.title });

  try {
    // Slack webhook
    const slackUrl = process.env.SLACK_WEBHOOK_URL;
    if (slackUrl) {
      const blocks: any[] = [
        { type: "header", text: { type: "plain_text", text: payload.title } },
        { type: "section", text: { type: "mrkdwn", text: payload.body } },
      ];
      if (payload.data) {
        blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `\`\`\`${JSON.stringify(payload.data, null, 2)}\`\`\`` }] });
      }
      const res = await fetch(slackUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachments: [{ color: payload.priority === "high" ? "#dc2626" : "#3b82f6", blocks }] }),
      });
      if (res.ok) return { success: true, provider: "slack", messageId: crypto.randomUUID() };
      log.warn({ status: res.status }, "Slack notification failed, falling back");
    }

    // Email via SMTP
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const nodemailerMod: any = await import("nodemailer" as any);
        const transport = nodemailerMod.default?.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: process.env.SMTP_SECURE === "true",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        if (transport) {
          await transport.sendMail({
            from: process.env.SMTP_FROM || "notifications@medibot.local",
            to: payload.userId,
            subject: payload.title,
            text: payload.body,
          });
          return { success: true, provider: "email", messageId: crypto.randomUUID() };
        }
      } catch (emailErr) {
        log.warn({ err: emailErr }, "Email notification failed, falling back to log");
      }
    }

    // Fallback: structured log entry
    log.info({ body: payload.body, data: payload.data, priority: payload.priority }, `[notification] ${channel}: ${payload.title}`);
    return { success: true, provider: "log", messageId: crypto.randomUUID() };
  } catch (err) {
    log.error({ err }, "Notification dispatch failed");
    return { success: false, provider: "error", error: String(err) };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Provider Implementation ───

export const notificationProvider: MedicationReminderProvider &
  FollowUpReminderProvider &
  ScreeningReminderProvider &
  VaccinationReminderProvider &
  LifestyleReminderProvider = {

  async sendMedicationReminder(payload: NotificationPayload): Promise<NotificationResult> {
    return dispatchToChannels(payload, "medication_reminder");
  },

  async scheduleReminder(payload: NotificationPayload, _scheduledAt: Date): Promise<NotificationResult> {
    await delay(50);
    return dispatchToChannels(payload, "scheduled_reminder");
  },

  async cancelReminder(reminderId: string): Promise<NotificationResult> {
    logger.info({ reminderId }, "Reminder cancelled");
    return { success: true, provider: "log" };
  },

  async sendFollowUpReminder(payload: NotificationPayload): Promise<NotificationResult> {
    return dispatchToChannels(payload, "follow_up_reminder");
  },

  async sendScreeningReminder(payload: NotificationPayload): Promise<NotificationResult> {
    return dispatchToChannels(payload, "screening_reminder");
  },

  async sendVaccinationReminder(payload: NotificationPayload): Promise<NotificationResult> {
    return dispatchToChannels(payload, "vaccination_reminder");
  },

  async sendLifestyleReminder(payload: NotificationPayload): Promise<NotificationResult> {
    return dispatchToChannels(payload, "lifestyle_reminder");
  },
};

// Re-export for backwards compatibility
export const mockNotificationProvider = notificationProvider;
