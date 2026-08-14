import { pgTable, text, timestamp, uuid, integer, jsonb, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Safety Evaluations (per-response) ───

export const safetyEvaluationsTable = pgTable("safety_evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id"),
  pipelineRunId: uuid("pipeline_run_id"),
  responseText: text("response_text").notNull(),
  queryText: text("query_text"),
  overallStatus: text("overall_status").notNull().default("pending"), // passed | warning | failed | blocked
  action: text("action").default("allow"), // allow | rewrite | block | fallback
  fallbackMessage: text("fallback_message"),
  originalResponse: text("original_response"),
  passedCount: integer("passed_count").default(0),
  warningCount: integer("warning_count").default(0),
  failedCount: integer("failed_count").default(0),
  qualityScore: real("quality_score"),
  hallucinationScore: real("hallucination_score"),
  confidenceScore: real("confidence_score"),
  clinicalRiskScore: real("clinical_risk_score"),
  evidenceCoverageScore: real("evidence_coverage_score"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Safety Violations ───

export const safetyViolationsTable = pgTable("safety_violations", {
  id: uuid("id").primaryKey().defaultRandom(),
  evaluationId: uuid("evaluation_id").references(() => safetyEvaluationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  validatorName: text("validator_name").notNull(),
  category: text("category").notNull(), // clinical | hallucination | consistency | compliance | injection | privacy | quality
  severity: text("severity").notNull(), // critical | high | medium | low | info
  message: text("message").notNull(),
  details: jsonb("details").default({}),
  triggerText: text("trigger_text"),
  suggestedAction: text("suggested_action"), // block | rewrite | warn | log
  isResolved: boolean("is_resolved").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Hallucination Events ───

export const hallucinationEventsTable = pgTable("hallucination_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  evaluationId: uuid("evaluation_id").references(() => safetyEvaluationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  riskScore: real("risk_score").notNull(),
  category: text("category").notNull(), // unsupported_claim | fabricated_fact | fake_value | invented_interaction | false_citation | impossible_recommendation
  claimText: text("claim_text"),
  evidenceAvailable: boolean("evidence_available").default(false),
  confidence: real("confidence"),
  details: jsonb("details").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Quality Scores (per-evaluation) ───

export const qualityScoresTable = pgTable("quality_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  evaluationId: uuid("evaluation_id").references(() => safetyEvaluationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  clinicalCompleteness: real("clinical_completeness"),
  readability: real("readability"),
  terminologyBalance: real("terminology_balance"),
  userFriendliness: real("user_friendliness"),
  safety: real("safety"),
  transparency: real("transparency"),
  actionability: real("actionability"),
  overallScore: real("overall_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Prompt Injection Attempts ───

export const promptInjectionAttemptsTable = pgTable("prompt_injection_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  conversationId: uuid("conversation_id"),
  inputText: text("input_text").notNull(),
  detectedPattern: text("detected_pattern"),
  category: text("category").notNull(), // ignore_instructions | pretend_doctor | jailbreak | prompt_extraction | system_override | role_play
  severity: text("severity").notNull(), // critical | high | medium | low
  action: text("action").notNull(), // blocked | sanitized | logged
  ipAddress: text("ip_address"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Regression Test Runs ───

export const regressionTestRunsTable = pgTable("regression_test_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  suiteName: text("suite_name").notNull(),
  version: text("version"),
  status: text("status").notNull().default("running"), // running | completed | failed
  totalTests: integer("total_tests").default(0),
  passed: integer("passed").default(0),
  failed: integer("failed").default(0),
  warnings: integer("warnings").default(0),
  hallucinationCount: integer("hallucination_count").default(0),
  safetyViolations: integer("safety_violations").default(0),
  avgLatencyMs: real("avg_latency_ms"),
  avgConfidence: real("avg_confidence"),
  totalTokensUsed: integer("total_tokens_used"),
  reportData: jsonb("report_data").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ─── Schemas ───

export const insertSafetyEvaluationSchema = createInsertSchema(safetyEvaluationsTable).omit({ id: true, createdAt: true });
export const selectSafetyEvaluationSchema = createSelectSchema(safetyEvaluationsTable);

export const insertSafetyViolationSchema = createInsertSchema(safetyViolationsTable).omit({ id: true, createdAt: true });
export const selectSafetyViolationSchema = createSelectSchema(safetyViolationsTable);

export const insertHallucinationEventSchema = createInsertSchema(hallucinationEventsTable).omit({ id: true, createdAt: true });
export const selectHallucinationEventSchema = createSelectSchema(hallucinationEventsTable);

export const insertQualityScoreSchema = createInsertSchema(qualityScoresTable).omit({ id: true, createdAt: true });

export type SafetyEvaluation = typeof safetyEvaluationsTable.$inferSelect;
export type InsertSafetyEvaluation = z.infer<typeof insertSafetyEvaluationSchema>;

export type SafetyViolation = typeof safetyViolationsTable.$inferSelect;
export type InsertSafetyViolation = z.infer<typeof insertSafetyViolationSchema>;

export type HallucinationEvent = typeof hallucinationEventsTable.$inferSelect;
export type InsertHallucinationEvent = z.infer<typeof insertHallucinationEventSchema>;

export type QualityScore = typeof qualityScoresTable.$inferSelect;
export type RegressionTestRun = typeof regressionTestRunsTable.$inferSelect;
