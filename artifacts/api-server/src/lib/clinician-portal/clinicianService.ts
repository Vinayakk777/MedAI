import { db, clinicianProfilesTable, patientAssignmentsTable } from "@workspace/db";
import { eq, and, desc, like, sql } from "drizzle-orm";
import type { ClinicianProfileData, PatientAssignmentData } from "./types";

export class ClinicianService {
  async createProfile(data: ClinicianProfileData): Promise<string> {
    const [saved] = await db.insert(clinicianProfilesTable).values({
      userId: data.userId,
      role: data.role,
      licenseNumber: data.licenseNumber,
      specialty: data.specialty,
      department: data.department,
      title: data.title,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
    }).returning();
    return saved.id;
  }

  async getProfile(userId: string) {
    const [profile] = await db.select()
      .from(clinicianProfilesTable)
      .where(eq(clinicianProfilesTable.userId, userId))
      .limit(1);
    return profile || null;
  }

  async getProfileById(id: string) {
    const [profile] = await db.select()
      .from(clinicianProfilesTable)
      .where(eq(clinicianProfilesTable.id, id))
      .limit(1);
    return profile || null;
  }

  async updateProfile(userId: string, updates: Partial<ClinicianProfileData>): Promise<void> {
    await db.update(clinicianProfilesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clinicianProfilesTable.userId, userId));
  }

  async searchClinicians(query: string, role?: string) {
    const conditions = [
      sql`(${clinicianProfilesTable.fullName} ilike ${`%${query}%`} OR ${clinicianProfilesTable.specialty} ilike ${`%${query}%`})`,
    ];
    if (role) conditions.push(eq(clinicianProfilesTable.role, role));

    return db.select()
      .from(clinicianProfilesTable)
      .where(and(...conditions))
      .limit(50);
  }

  // ─── Patient Assignments ───

  async assignPatient(data: PatientAssignmentData): Promise<string> {
    // Check if already assigned
    const [existing] = await db.select()
      .from(patientAssignmentsTable)
      .where(and(
        eq(patientAssignmentsTable.clinicianId, data.clinicianId),
        eq(patientAssignmentsTable.patientUserId, data.patientUserId),
        eq(patientAssignmentsTable.isActive, true),
      ))
      .limit(1);

    if (existing) return existing.id;

    const [saved] = await db.insert(patientAssignmentsTable).values({
      clinicianId: data.clinicianId,
      patientUserId: data.patientUserId,
      relationship: data.relationship,
      notes: data.notes,
    }).returning();

    return saved.id;
  }

  async unassignPatient(clinicianId: string, patientUserId: string): Promise<void> {
    await db.update(patientAssignmentsTable)
      .set({ isActive: false, unassignedAt: new Date() })
      .where(and(
        eq(patientAssignmentsTable.clinicianId, clinicianId),
        eq(patientAssignmentsTable.patientUserId, patientUserId),
        eq(patientAssignmentsTable.isActive, true),
      ));
  }

  async getPatientsForClinician(clinicianId: string) {
    return db.select({
      assignment: patientAssignmentsTable,
      clinician: clinicianProfilesTable,
    })
      .from(patientAssignmentsTable)
      .innerJoin(clinicianProfilesTable, eq(patientAssignmentsTable.clinicianId, clinicianProfilesTable.id))
      .where(and(
        eq(patientAssignmentsTable.clinicianId, clinicianId),
        eq(patientAssignmentsTable.isActive, true),
      ));
  }

  async getCliniciansForPatient(patientUserId: string) {
    return db.select({
      assignment: patientAssignmentsTable,
      clinician: clinicianProfilesTable,
    })
      .from(patientAssignmentsTable)
      .innerJoin(clinicianProfilesTable, eq(patientAssignmentsTable.clinicianId, clinicianProfilesTable.id))
      .where(and(
        eq(patientAssignmentsTable.patientUserId, patientUserId),
        eq(patientAssignmentsTable.isActive, true),
      ));
  }

  async getAllClinicians(role?: string) {
    const conditions = role ? [eq(clinicianProfilesTable.role, role)] : [];
    return db.select()
      .from(clinicianProfilesTable)
      .where(and(...conditions, eq(clinicianProfilesTable.isActive, true)))
      .orderBy(clinicianProfilesTable.fullName);
  }

  async getPatientCountsForClinician(clinicianId: string) {
    const [total] = await db.select({ count: sql<number>`count(*)` })
      .from(patientAssignmentsTable)
      .where(and(
        eq(patientAssignmentsTable.clinicianId, clinicianId),
        eq(patientAssignmentsTable.isActive, true),
      ));
    return Number(total.count);
  }
}
