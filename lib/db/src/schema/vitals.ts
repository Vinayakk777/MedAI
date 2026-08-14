import { pgTable, text, timestamp, uuid, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vitalsTable = pgTable("vitals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  heartRate: integer("heart_rate"),
  systolic: integer("systolic"),
  diastolic: integer("diastolic"),
  respiratoryRate: integer("respiratory_rate"),
  temperature: numeric("temperature", { precision: 4, scale: 1 }),
  oxygenSaturation: integer("oxygen_saturation"),
  bloodGlucose: numeric("blood_glucose", { precision: 5, scale: 1 }),
  weight: numeric("weight", { precision: 5, scale: 1 }),
  height: numeric("height", { precision: 5, scale: 1 }),
  bmi: numeric("bmi", { precision: 4, scale: 1 }),
  waistCircumference: numeric("waist_circumference", { precision: 5, scale: 1 }),
  painScore: integer("pain_score"),
  source: text("source").notNull().default("manual"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVitalSchema = createInsertSchema(vitalsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  recordedAt: true,
});

export const selectVitalSchema = createSelectSchema(vitalsTable);

export type InsertVital = z.infer<typeof insertVitalSchema>;
export type Vital = typeof vitalsTable.$inferSelect;
