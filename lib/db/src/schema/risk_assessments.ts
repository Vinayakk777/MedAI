import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
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
}, (t) => ({
  userIdx: index("risk_assessments_user_id_idx").on(t.userId),
  userIdAssessedIdx: index("risk_assessments_user_id_assessed_idx").on(t.userId, t.assessedAt),
}));

export const insertRiskAssessmentSchema = createInsertSchema(riskAssessmentsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  assessedAt: true,
});

export const selectRiskAssessmentSchema = createSelectSchema(riskAssessmentsTable);

export type InsertRiskAssessment = z.infer<typeof insertRiskAssessmentSchema>;
export type RiskAssessment = typeof riskAssessmentsTable.$inferSelect;
