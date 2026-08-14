import { pgTable, text, timestamp, uuid, integer, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Pipeline Runs ───

export const agentPipelineRunsTable = pgTable("agent_pipeline_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id"),
  status: text("status").notNull().default("running"), // running | completed | failed | partial
  pipelineName: text("pipeline_name").default("standard"),
  triggerEvent: text("trigger_event"), // user_message | auto | manual
  executionOrder: jsonb("execution_order").$type<string[]>().default([]),
  consensusSummary: text("consensus_summary"),
  responseContent: text("response_content"),
  totalDurationMs: integer("total_duration_ms"),
  totalAgents: integer("total_agents").default(0),
  successfulAgents: integer("successful_agents").default(0),
  failedAgents: integer("failed_agents").default(0),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ─── Agent Executions ───

export const agentExecutionsTable = pgTable("agent_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineRunId: uuid("pipeline_run_id").notNull().references(() => agentPipelineRunsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  agentName: text("agent_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed | skipped
  inputData: jsonb("input_data").default({}),
  outputData: jsonb("output_data").default({}),
  confidence: real("confidence"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(2),
  llmProvider: text("llm_provider"),
  llmModel: text("llm_model"),
  tokensUsed: integer("tokens_used"),
  executionOrder: integer("execution_order"),
  dependsOn: jsonb("depends_on").$type<string[]>().default([]),
  metadata: jsonb("metadata").default({}),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Consensus Decisions ───

export const agentConsensusDecisionsTable = pgTable("agent_consensus_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineRunId: uuid("pipeline_run_id").notNull().references(() => agentPipelineRunsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // symptoms | diagnosis | risk | medication | lab | self_care | follow_up | evidence
  consensusText: text("consensus_text"),
  confidence: real("confidence"),
  agreementLevel: text("agreement_level"), // unanimous | majority | partial | conflicting
  contributingAgents: jsonb("contributing_agents").$type<string[]>().default([]),
  dissentingAgents: jsonb("dissenting_agents").$type<string[]>().default([]),
  disagreements: jsonb("disagreements").default([]),
  resolution: text("resolution"), // resolved | unresolved | overridden
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Agent Performance Metrics ───

export const agentPerformanceMetricsTable = pgTable("agent_performance_metrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentName: text("agent_name").notNull(),
  totalExecutions: integer("total_executions").default(0),
  successfulExecutions: integer("successful_executions").default(0),
  failedExecutions: integer("failed_executions").default(0),
  avgDurationMs: integer("avg_duration_ms"),
  avgConfidence: real("avg_confidence"),
  avgTokensUsed: integer("avg_tokens_used"),
  lastExecutionAt: timestamp("last_execution_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Schemas ───

export const insertPipelineRunSchema = createInsertSchema(agentPipelineRunsTable).omit({ id: true, createdAt: true });
export const selectPipelineRunSchema = createSelectSchema(agentPipelineRunsTable);

export const insertAgentExecutionSchema = createInsertSchema(agentExecutionsTable).omit({ id: true, createdAt: true });
export const selectAgentExecutionSchema = createSelectSchema(agentExecutionsTable);

export const insertConsensusDecisionSchema = createInsertSchema(agentConsensusDecisionsTable).omit({ id: true, createdAt: true });
export const selectConsensusDecisionSchema = createSelectSchema(agentConsensusDecisionsTable);

// ─── Types ───

export type AgentPipelineRun = typeof agentPipelineRunsTable.$inferSelect;
export type InsertAgentPipelineRun = z.infer<typeof insertPipelineRunSchema>;

export type AgentExecution = typeof agentExecutionsTable.$inferSelect;
export type InsertAgentExecution = z.infer<typeof insertAgentExecutionSchema>;

export type ConsensusDecision = typeof agentConsensusDecisionsTable.$inferSelect;
export type InsertConsensusDecision = z.infer<typeof insertConsensusDecisionSchema>;
