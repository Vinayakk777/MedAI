import { db, carePlansTable, followUpTasksTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { CarePlanInput } from "./types";

export class CarePlanService {
  async createCarePlan(clinicianId: string, input: CarePlanInput): Promise<string> {
    const [saved] = await db.insert(carePlansTable).values({
      patientUserId: input.patientUserId,
      clinicianId,
      title: input.title,
      description: input.description,
      goals: input.goals,
      interventions: input.interventions,
      medications: input.medications,
      followUpSchedule: input.followUpSchedule,
    }).returning();
    return saved.id;
  }

  async updateCarePlan(carePlanId: string, updates: Partial<CarePlanInput>): Promise<void> {
    await db.update(carePlansTable)
      .set(updates as any)
      .where(eq(carePlansTable.id, carePlanId));
  }

  async completeCarePlan(carePlanId: string): Promise<void> {
    await db.update(carePlansTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(carePlansTable.id, carePlanId));
  }

  async getCarePlan(carePlanId: string) {
    const [plan] = await db.select()
      .from(carePlansTable)
      .where(eq(carePlansTable.id, carePlanId))
      .limit(1);
    return plan || null;
  }

  async getCarePlansForPatient(patientUserId: string) {
    return db.select()
      .from(carePlansTable)
      .where(eq(carePlansTable.patientUserId, patientUserId))
      .orderBy(desc(carePlansTable.createdAt));
  }

  async getActiveCarePlans(clinicianId: string) {
    return db.select()
      .from(carePlansTable)
      .where(and(
        eq(carePlansTable.clinicianId, clinicianId),
        eq(carePlansTable.status, "active"),
      ))
      .orderBy(desc(carePlansTable.createdAt));
  }

  // ─── Follow-Up Tasks ───

  async createTask(clinicianId: string, input: {
    patientUserId: string;
    carePlanId?: string;
    title: string;
    description?: string;
    priority?: string;
    dueDate?: Date;
    assignedTo?: string;
  }): Promise<string> {
    const [saved] = await db.insert(followUpTasksTable).values({
      patientUserId: input.patientUserId,
      clinicianId,
      carePlanId: input.carePlanId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? "medium",
      dueDate: input.dueDate,
      assignedTo: input.assignedTo,
    }).returning();
    return saved.id;
  }

  async completeTask(taskId: string): Promise<void> {
    await db.update(followUpTasksTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(followUpTasksTable.id, taskId));
  }

  async getTasksForPatient(patientUserId: string) {
    return db.select()
      .from(followUpTasksTable)
      .where(eq(followUpTasksTable.patientUserId, patientUserId))
      .orderBy(desc(followUpTasksTable.createdAt));
  }

  async getPendingTasks(clinicianId: string) {
    return db.select()
      .from(followUpTasksTable)
      .where(and(
        eq(followUpTasksTable.clinicianId, clinicianId),
        eq(followUpTasksTable.status, "pending"),
      ))
      .orderBy(followUpTasksTable.dueDate);
  }
}
