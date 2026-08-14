import { db, auditLogsTable, anonymizedEventsTable } from "@workspace/db";
import { eq, and, gte, desc, count, sql } from "drizzle-orm";
import type { AuditLogInput } from "./types";

export class AuditLogger {
  async log(input: AuditLogInput): Promise<string> {
    // Strip any PHI from changes before storing
    const sanitized = this.sanitizeChanges(input.changes);

    const [saved] = await db.insert(auditLogsTable).values({
      userId: input.userId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      changes: sanitized,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    }).returning();

    return saved.id;
  }

  async getAuditLogs(limit = 100, offset = 0, resourceType?: string, action?: string) {
    const conditions = [];
    if (resourceType) conditions.push(eq(auditLogsTable.resourceType, resourceType));
    if (action) conditions.push(eq(auditLogsTable.action, action));

    return db.select()
      .from(auditLogsTable)
      .where(and(...conditions))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getAuditSummary() {
    const [total] = await db.select({ value: count() }).from(auditLogsTable);

    const actions = await db.select({
      action: auditLogsTable.action,
      value: count(),
    })
      .from(auditLogsTable)
      .groupBy(auditLogsTable.action)
      .orderBy(sql<number>`count(*) desc`)
      .limit(20);

    const resourceTypes = await db.select({
      type: auditLogsTable.resourceType,
      value: count(),
    })
      .from(auditLogsTable)
      .groupBy(auditLogsTable.resourceType)
      .orderBy(sql<number>`count(*) desc`);

    return {
      total: Number(total.value),
      actions: actions.map((a) => ({ action: a.action, count: Number(a.value) })),
      resourceTypes: resourceTypes.map((r) => ({ type: r.type, count: Number(r.value) })),
    };
  }

  async recordAnonymizedEvent(eventType: string, payload: Record<string, unknown>, anonymousId?: string): Promise<string> {
    // Ensure no PHI is in the payload
    const safePayload = this.stripPhi(payload);

    const [saved] = await db.insert(anonymizedEventsTable).values({
      eventType,
      anonymousId,
      payload: safePayload,
    }).returning();

    return saved.id;
  }

  private sanitizeChanges(changes?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!changes) return undefined;

    const sensitiveKeys = ["ssn", "email", "phone", "address", "dob", "date_of_birth",
      "patient_name", "patientName", "full_name"];

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeChanges(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private stripPhi(payload: Record<string, unknown>): Record<string, unknown> {
    return this.sanitizeChanges(payload) || payload;
  }
}
