import { db, physicianNotesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import type { SOAPNoteInput, SOAPNote } from "./types";

export class PhysicianNotesService {
  async createNote(clinicianId: string, input: SOAPNoteInput): Promise<string> {
    const [saved] = await db.insert(physicianNotesTable).values({
      patientUserId: input.patientUserId,
      clinicianId,
      consultationId: input.consultationId,
      version: 1,
      subjective: input.subjective,
      objective: input.objective,
      assessment: input.assessment,
      plan: input.plan,
      diagnosis: input.diagnosis,
      icdCodes: input.icdCodes,
    }).returning();
    return saved.id;
  }

  async updateNote(noteId: string, clinicianId: string, input: Partial<SOAPNoteInput>): Promise<string> {
    const [existing] = await db.select()
      .from(physicianNotesTable)
      .where(eq(physicianNotesTable.id, noteId))
      .limit(1);

    if (!existing) throw new Error("Note not found");
    if (existing.isFinalized) throw new Error("Cannot modify a finalized note");

    // Create new version
    const [saved] = await db.insert(physicianNotesTable).values({
      patientUserId: input.patientUserId || existing.patientUserId,
      clinicianId,
      consultationId: input.consultationId || existing.consultationId,
      version: (existing.version ?? 0) + 1,
      subjective: input.subjective ?? existing.subjective,
      objective: input.objective ?? existing.objective,
      assessment: input.assessment ?? existing.assessment,
      plan: input.plan ?? existing.plan,
      diagnosis: input.diagnosis ?? existing.diagnosis,
      icdCodes: input.icdCodes ?? existing.icdCodes,
      parentVersionId: existing.id,
    }).returning();

    return saved.id;
  }

  async finalizeNote(noteId: string): Promise<void> {
    await db.update(physicianNotesTable)
      .set({ isFinalized: true, finalizedAt: new Date() })
      .where(eq(physicianNotesTable.id, noteId));
  }

  async getNote(noteId: string) {
    const [note] = await db.select()
      .from(physicianNotesTable)
      .where(eq(physicianNotesTable.id, noteId))
      .limit(1);
    return note || null;
  }

  async getNotesForPatient(patientUserId: string) {
    return db.select()
      .from(physicianNotesTable)
      .where(eq(physicianNotesTable.patientUserId, patientUserId))
      .orderBy(desc(physicianNotesTable.createdAt));
  }

  async getLatestNoteForConsultation(consultationId: string) {
    const [note] = await db.select()
      .from(physicianNotesTable)
      .where(and(
        eq(physicianNotesTable.consultationId, consultationId),
        eq(physicianNotesTable.isFinalized, true),
      ))
      .orderBy(desc(physicianNotesTable.version))
      .limit(1);
    return note || null;
  }

  async getNoteVersionHistory(noteId: string) {
    const [original] = await db.select()
      .from(physicianNotesTable)
      .where(eq(physicianNotesTable.id, noteId))
      .limit(1);

    if (!original) return [];

    const conditions = [eq(physicianNotesTable.patientUserId, original.patientUserId)];
    if (original.consultationId) {
      conditions.push(eq(physicianNotesTable.consultationId, original.consultationId));
    }

    return db.select()
      .from(physicianNotesTable)
      .where(and(...conditions))
      .orderBy(desc(physicianNotesTable.version));
  }

  async getNotesByClinician(clinicianId: string, limit = 50) {
    return db.select()
      .from(physicianNotesTable)
      .where(eq(physicianNotesTable.clinicianId, clinicianId))
      .orderBy(desc(physicianNotesTable.createdAt))
      .limit(limit);
  }
}
