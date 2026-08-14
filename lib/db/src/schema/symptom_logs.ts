import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const symptomLogsTable = pgTable("symptom_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  symptoms: text("symptoms").array().notNull(),
  assessmentLevel: text("assessment_level").notNull(),
  assessmentTitle: text("assessment_title").notNull(),
  assessmentDescription: text("assessment_description"),
  assessmentAction: text("assessment_action"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSymptomLogSchema = createInsertSchema(symptomLogsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const selectSymptomLogSchema = createSelectSchema(symptomLogsTable);

export type InsertSymptomLog = z.infer<typeof insertSymptomLogSchema>;
export type SymptomLog = typeof symptomLogsTable.$inferSelect;
