import { pgTable, text, timestamp, uuid, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const medicationsTable = pgTable("medications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  dose: text("dose"),
  frequency: text("frequency"),
  category: text("category"),
  purpose: text("purpose"),
  timeOfDay: text("time_of_day"),
  interactions: text("interactions").array(),
  status: text("status").notNull().default("active"),
  refillDays: integer("refill_days"),
  startedAt: date("started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

const baseInsert = createInsertSchema(medicationsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMedicationSchema = baseInsert.extend({
  interactions: z.array(z.string()).optional().default([]),
});

export const updateMedicationSchema = baseInsert.partial();

export const selectMedicationSchema = createSelectSchema(medicationsTable);

export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type UpdateMedication = z.infer<typeof updateMedicationSchema>;
export type Medication = typeof medicationsTable.$inferSelect;
