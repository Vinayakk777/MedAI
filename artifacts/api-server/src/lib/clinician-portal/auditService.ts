import { db, clinicianAuditLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { AuditEventInput } from "./types";

export class AuditService {
  async record(input: AuditEventInput): Promise<string> {
    const [saved] = await db.insert(clinicianAuditLogsTable).values({
      clinicianId: input.clinicianId,
      patientUserId: input.patientUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      details: input.details,
      ipAddress: input.ipAddress,
    }).returning();
    return saved.id;
  }

  async getAuditLogs(limit = 100, offset = 0, filters?: {
    clinicianId?: string;
    patientUserId?: string;
    action?: string;
    resourceType?: string;
  }) {
    const conditions = [];
    if (filters?.clinicianId) conditions.push(eq(clinicianAuditLogsTable.clinicianId, filters.clinicianId));
    if (filters?.patientUserId) conditions.push(eq(clinicianAuditLogsTable.patientUserId, filters.patientUserId));
    if (filters?.action) conditions.push(eq(clinicianAuditLogsTable.action, filters.action));
    if (filters?.resourceType) conditions.push(eq(clinicianAuditLogsTable.resourceType, filters.resourceType));

    return db.select()
      .from(clinicianAuditLogsTable)
      .where(and(...conditions))
      .orderBy(desc(clinicianAuditLogsTable.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getPatientAccessLog(patientUserId: string) {
    return this.getAuditLogs(200, 0, { patientUserId });
  }

  async getClinicianActivity(clinicianId: string, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return db.select()
      .from(clinicianAuditLogsTable)
      .where(and(
        eq(clinicianAuditLogsTable.clinicianId, clinicianId),
      ))
      .orderBy(desc(clinicianAuditLogsTable.createdAt));
  }
}
