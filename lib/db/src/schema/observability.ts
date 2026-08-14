import { pgTable, text, timestamp, uuid, integer, jsonb, real, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── 1. Consultation Analytics ───

export const consultationAnalyticsTable = pgTable("consultation_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id").notNull().unique(),
  durationMs: integer("duration_ms"),
  followUpCount: integer("follow_up_count").default(0),
  tokensUsed: integer("tokens_used"),
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  llmProvider: text("llm_provider"),
  llmModel: text("llm_model"),
  responseLatencyMs: integer("response_latency_ms"),
  retrievalLatencyMs: integer("retrieval_latency_ms"),
  agentExecutionTimeMs: integer("agent_execution_time_ms"),
  safetyInterventions: integer("safety_interventions").default(0),
  safetyAction: text("safety_action"), // allow | rewrite | block | fallback
  confidenceScore: real("confidence_score"),
  hallucinationScore: real("hallucination_score"),
  qualityScore: real("quality_score"),
  finalRiskCategory: text("final_risk_category"), // low | moderate | high | emergency
  recommendationCategory: text("recommendation_category"), // self_care | consult | urgent | emergency
  retrievalSuccess: boolean("retrieval_success"),
  chunksRetrieved: integer("chunks_retrieved"),
  hadEscalation: boolean("had_escalation").default(false),
  hadFallback: boolean("had_fallback").default(false),
  errorType: text("error_type"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 2. User Feedback ───

export const userFeedbackTable = pgTable("user_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),
  rating: text("rating").notNull(), // helpful | not_helpful
  accuracyRating: integer("accuracy_rating"), // 1-5
  easeOfUnderstanding: integer("ease_of_understanding"), // 1-5
  helpfulness: integer("helpfulness"), // 1-5
  trustLevel: integer("trust_level"), // 1-5
  freeText: text("free_text"),
  categories: text("categories").array(), // detected categories
  isResolved: boolean("is_resolved").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 3. Feedback Complaint Patterns (auto-detected) ───

export const feedbackPatternsTable = pgTable("feedback_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  pattern: text("pattern").notNull(), // "too_much_jargon", "repetitive_advice", etc.
  label: text("label").notNull(),
  keywordMatch: text("keyword_match"),
  frequency: integer("frequency").default(1),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
});

// ─── 4. AI Quality Metrics (aggregated snapshots) ───

export const aiQualityMetricsTable = pgTable("ai_quality_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  resolution: text("resolution").notNull(), // hourly | daily | weekly | monthly
  avgConfidenceScore: real("avg_confidence_score"),
  avgHallucinationScore: real("avg_hallucination_score"),
  avgQualityScore: real("avg_quality_score"),
  totalEvaluations: integer("total_evaluations").default(0),
  hallucinationIncidents: integer("hallucination_incidents").default(0),
  safetyViolations: integer("safety_violations").default(0),
  escalationFrequency: integer("escalation_frequency").default(0),
  falseEmergencyAlerts: integer("false_emergency_alerts").default(0),
  lowConfidenceResponses: integer("low_confidence_responses").default(0),
  modelFallbackCount: integer("model_fallback_count").default(0),
  retrievalSuccessRate: real("retrieval_success_rate"),
  avgResponseLatencyMs: real("avg_response_latency_ms"),
  avgTokensPerConsultation: real("avg_tokens_per_consultation"),
  activeUsers: integer("active_users").default(0),
  totalConsultations: integer("total_consultations").default(0),
  satisfactionScore: real("satisfaction_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 5. Provider Performance ───

export const providerPerformanceTable = pgTable("provider_performance", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(), // gemini | groq | openai | claude | local
  model: text("model").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  totalCalls: integer("total_calls").default(0),
  totalTokens: integer("total_tokens").default(0),
  totalCost: real("total_cost").default(0),
  avgLatencyMs: real("avg_latency_ms"),
  p50LatencyMs: real("p50_latency_ms"),
  p95LatencyMs: real("p95_latency_ms"),
  p99LatencyMs: real("p99_latency_ms"),
  failureCount: integer("failure_count").default(0),
  failureRate: real("failure_rate"),
  avgUserSatisfaction: real("avg_user_satisfaction"),
  avgQualityScore: real("avg_quality_score"),
  hallucinationRate: real("hallucination_rate"),
  avgConfidence: real("avg_confidence"),
  successCount: integer("success_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 6. Provider Call Log (per-request) ───

export const providerCallLogsTable = pgTable("provider_call_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id"),
  userId: text("user_id"),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  taskType: text("task_type"), // generation | assessment | analysis | retrieval
  latencyMs: integer("latency_ms"),
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  cost: real("cost"),
  success: boolean("success").default(true),
  errorType: text("error_type"),
  statusCode: integer("status_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 7. Prompt Versions ───

export const promptVersionsTable = pgTable("prompt_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  changeLog: text("change_log"),
  author: text("author"),
  status: text("status").default("draft"), // draft | active | archived | rolled_back
  tags: text("tags").array(),
  parentVersionId: uuid("parent_version_id"),
  metadata: jsonb("metadata").default({}),
  performanceBefore: jsonb("performance_before"),
  performanceAfter: jsonb("performance_after"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  activatedAt: timestamp("activated_at"),
}, (table) => ({
  nameVersionIdx: uniqueIndex("prompt_name_version_idx").on(table.name, table.version),
}));

// ─── 8. Prompt Version Deployments ───

export const promptDeploymentsTable = pgTable("prompt_deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptVersionId: uuid("prompt_version_id").notNull().references(() => promptVersionsTable.id),
  environment: text("environment").notNull(), // dev | staging | production
  trafficPercent: integer("traffic_percent").default(100),
  isActive: boolean("is_active").default(true),
  deployedBy: text("deployed_by"),
  deployedAt: timestamp("deployed_at").defaultNow().notNull(),
  deactivatedAt: timestamp("deactivated_at"),
});

// ─── 9. A/B Test Assignments ───

export const abTestAssignmentsTable = pgTable("ab_test_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  conversationId: uuid("conversation_id"),
  promptName: text("prompt_name").notNull(),
  variantA: integer("variant_a").notNull(),
  variantB: integer("variant_b").notNull(),
  assignedVariant: integer("assigned_variant").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 10. Evaluation Runs ───

export const evaluationRunsTable = pgTable("evaluation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  promptVersionId: uuid("prompt_version_id").references(() => promptVersionsTable.id),
  status: text("status").default("pending"), // pending | running | completed | failed
  totalScenarios: integer("total_scenarios").default(0),
  passed: integer("passed").default(0),
  failed: integer("failed").default(0),
  avgAccuracy: real("avg_accuracy"),
  avgSafetyScore: real("avg_safety_score"),
  avgDiagnosisConsistency: real("avg_diagnosis_consistency"),
  avgFollowUpQuality: real("avg_follow_up_quality"),
  avgUserSatisfaction: real("avg_user_satisfaction"),
  avgLatencyMs: real("avg_latency_ms"),
  reportData: jsonb("report_data"),
  triggeredBy: text("triggered_by"), // manual | auto_deploy | scheduled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ─── 11. Evaluation Results (individual check) ───

export const evaluationResultsTable = pgTable("evaluation_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => evaluationRunsTable.id, { onDelete: "cascade" }),
  scenarioId: text("scenario_id").notNull(),
  scenarioName: text("scenario_name"),
  passed: boolean("passed").default(false),
  accuracyScore: real("accuracy_score"),
  safetyScore: real("safety_score"),
  consistencyScore: real("consistency_score"),
  followUpScore: real("follow_up_score"),
  latencyMs: integer("latency_ms"),
  errors: text("errors"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 12. Alert Configurations ───

export const alertConfigsTable = pgTable("alert_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  metric: text("metric").notNull(), // hallucination_rate | safety_violations | provider_outage | latency_spike | retrieval_failures | satisfaction_drop
  operator: text("operator").notNull(), // gt | gte | lt | lte | eq | change_percent
  threshold: real("threshold").notNull(),
  windowMinutes: integer("window_minutes").default(60),
  cooldownMinutes: integer("cooldown_minutes").default(30),
  severity: text("severity").default("warning"), // critical | warning | info
  channels: text("channels").array(), // email | slack | webhook | pagerduty
  enabled: boolean("enabled").default(true),
  lastFiredAt: timestamp("last_fired_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── 13. Alert Events ───

export const alertEventsTable = pgTable("alert_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  configId: uuid("config_id").references(() => alertConfigsTable.id),
  metric: text("metric").notNull(),
  metricValue: real("metric_value"),
  threshold: real("threshold"),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  details: jsonb("details").default({}),
  channelsNotified: text("channels_notified").array(),
  isResolved: boolean("is_resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 14. Audit Log (immutable) ───

export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id"),
  action: text("action").notNull(), // prompt_created | prompt_activated | prompt_rolled_back | config_changed | feedback_deleted | alert_modified
  resourceType: text("resource_type").notNull(), // prompt_version | alert_config | feedback | evaluation | deployment
  resourceId: text("resource_id"),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 15. Anonymized Operational Events (no PHI) ───

export const anonymizedEventsTable = pgTable("anonymized_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(), // consultation | feedback | quality | error | performance
  anonymousId: text("anonymous_id"),
  payload: jsonb("payload").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Zod Schemas ───

export const insertConsultationAnalyticsSchema = createInsertSchema(consultationAnalyticsTable).omit({ id: true, createdAt: true });
export const insertUserFeedbackSchema = createInsertSchema(userFeedbackTable).omit({ id: true, createdAt: true });
export const insertFeedbackPatternSchema = createInsertSchema(feedbackPatternsTable).omit({ id: true, firstSeen: true, lastSeen: true });
export const insertAiQualityMetricSchema = createInsertSchema(aiQualityMetricsTable).omit({ id: true, createdAt: true });
export const insertProviderPerformanceSchema = createInsertSchema(providerPerformanceTable).omit({ id: true, createdAt: true });
export const insertProviderCallLogSchema = createInsertSchema(providerCallLogsTable).omit({ id: true, createdAt: true });
export const insertPromptVersionSchema = createInsertSchema(promptVersionsTable).omit({ id: true, createdAt: true });
export const insertEvaluationRunSchema = createInsertSchema(evaluationRunsTable).omit({ id: true, createdAt: true });
export const insertAlertConfigSchema = createInsertSchema(alertConfigsTable).omit({ id: true, lastFiredAt: true, createdAt: true, updatedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({ id: true, createdAt: true });

// ─── Types ───

export type ConsultationAnalytics = typeof consultationAnalyticsTable.$inferSelect;
export type InsertConsultationAnalytics = z.infer<typeof insertConsultationAnalyticsSchema>;

export type UserFeedback = typeof userFeedbackTable.$inferSelect;
export type PromptVersion = typeof promptVersionsTable.$inferSelect;
export type EvaluationRun = typeof evaluationRunsTable.$inferSelect;
export type EvaluationResult = typeof evaluationResultsTable.$inferSelect;
export type AlertConfig = typeof alertConfigsTable.$inferSelect;
export type AlertEvent = typeof alertEventsTable.$inferSelect;
export type AuditLog = typeof auditLogsTable.$inferSelect;
export type ProviderPerformance = typeof providerPerformanceTable.$inferSelect;
export type ProviderCallLog = typeof providerCallLogsTable.$inferSelect;
