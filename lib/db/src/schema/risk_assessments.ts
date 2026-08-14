import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const riskAssessmentsTable = pgTable("risk_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  score: integer("score").notNull(),
  baseline: integer("baseline").default(50),
  level: text("level").notNull().default("low"),
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRiskAssessmentSchema = createInsertSchema(riskAssessmentsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  assessedAt: true,
});

export const selectRiskAssessmentSchema = createSelectSchema(riskAssessmentsTable);

export type InsertRiskAssessment = z.infer<typeof insertRiskAssessmentSchema>;
export type RiskAssessment = typeof riskAssessmentsTable.$inferSelect;
