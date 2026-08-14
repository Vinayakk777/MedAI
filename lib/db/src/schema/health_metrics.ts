import { pgTable, text, timestamp, uuid, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const healthMetricsTable = pgTable("health_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  metricDate: date("metric_date").notNull(),
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
  sleepHours: numeric("sleep_hours", { precision: 3, scale: 1 }),
  steps: integer("steps"),
  caloriesBurned: integer("calories_burned"),
  activityLevel: integer("activity_level"),
  stressLevel: integer("stress_level"),
  hydrationLevel: integer("hydration_level"),
  painScore: integer("pain_score"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertHealthMetricSchema = createInsertSchema(healthMetricsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const selectHealthMetricSchema = createSelectSchema(healthMetricsTable);

export type InsertHealthMetric = z.infer<typeof insertHealthMetricSchema>;
export type HealthMetric = typeof healthMetricsTable.$inferSelect;
