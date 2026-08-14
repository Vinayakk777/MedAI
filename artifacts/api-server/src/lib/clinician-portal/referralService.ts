import { db, clinReferralsTable, alertCenterTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { AlertInput } from "./types";

export class ReferralService {
  async createReferral(input: {
    patientUserId: string;
    referringClinicianId: string;
    specialistClinicianId?: string;
    specialty: string;
    reason: string;
    urgency?: string;
    notes?: string;
  }): Promise<string> {
    const [saved] = await db.insert(clinReferralsTable).values({
      patientUserId: input.patientUserId,
      referringClinicianId: input.referringClinicianId,
      specialistClinicianId: input.specialistClinicianId,
      specialty: input.specialty,
      reason: input.reason,
      urgency: input.urgency ?? "routine",
      notes: input.notes,
    }).returning();
    return saved.id;
  }

  async updateReferral(referralId: string, updates: {
    status?: string;
    responseNotes?: string;
    specialistClinicianId?: string;
  }): Promise<void> {
    const data: any = { ...updates };
    if (updates.status === "accepted" || updates.status === "declined") {
      data.respondedAt = new Date();
    }
    if (updates.status === "completed") {
      data.completedAt = new Date();
    }
    await db.update(clinReferralsTable).set(data).where(eq(clinReferralsTable.id, referralId));
  }

  async getReferral(referralId: string) {
    const [ref] = await db.select()
      .from(clinReferralsTable)
      .where(eq(clinReferralsTable.id, referralId))
      .limit(1);
    return ref || null;
  }

  async getReferralsForPatient(patientUserId: string) {
    return db.select()
      .from(clinReferralsTable)
      .where(eq(clinReferralsTable.patientUserId, patientUserId))
      .orderBy(desc(clinReferralsTable.createdAt));
  }

  async getPendingReferrals(clinicianId: string) {
    return db.select()
      .from(clinReferralsTable)
      .where(and(
        eq(clinReferralsTable.specialistClinicianId, clinicianId),
        eq(clinReferralsTable.status, "pending"),
      ))
      .orderBy(desc(clinReferralsTable.createdAt));
  }

  async getOutgoingReferrals(clinicianId: string) {
    return db.select()
      .from(clinReferralsTable)
      .where(eq(clinReferralsTable.referringClinicianId, clinicianId))
      .orderBy(desc(clinReferralsTable.createdAt));
  }
}

// ─── Alert Center ───

export class AlertCenterService {
  async createAlert(input: AlertInput): Promise<string> {
    const [saved] = await db.insert(alertCenterTable).values({
      clinicianId: input.clinicianId,
      patientUserId: input.patientUserId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
    }).returning();
    return saved.id;
  }

  async markAsRead(alertId: string): Promise<void> {
    await db.update(alertCenterTable)
      .set({ isRead: true })
      .where(eq(alertCenterTable.id, alertId));
  }

  async resolveAlert(alertId: string): Promise<void> {
    await db.update(alertCenterTable)
      .set({ isResolved: true })
      .where(eq(alertCenterTable.id, alertId));
  }

  async getAlertsForClinician(clinicianId: string, includeResolved = false) {
    const conditions = [eq(alertCenterTable.clinicianId, clinicianId)];
    if (!includeResolved) conditions.push(eq(alertCenterTable.isResolved, false));

    return db.select()
      .from(alertCenterTable)
      .where(and(...conditions))
      .orderBy(desc(alertCenterTable.createdAt));
  }

  async getUnreadCount(clinicianId: string) {
    const [result] = await db.select({ value: sql<number>`count(*)` })
      .from(alertCenterTable)
      .where(and(
        eq(alertCenterTable.clinicianId, clinicianId),
        eq(alertCenterTable.isRead, false),
        eq(alertCenterTable.isResolved, false),
      ));
    return Number(result.value);
  }
}


