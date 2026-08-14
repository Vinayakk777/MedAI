import { db, agentPipelineRunsTable, agentExecutionsTable, agentConsensusDecisionsTable, agentPerformanceMetricsTable } from "@workspace/db";
import { eq, desc, asc, and, count as drizzleCount, sql } from "drizzle-orm";
import { ExecutionLogEntry, AgentOutput, ConsensusDecision } from "./types";

export class ExecutionLogger {
  async createRun(params: {
    userId: string;
    conversationId?: string;
    pipelineName?: string;
    triggerEvent?: string;
  }): Promise<string> {
    const [run] = await db.insert(agentPipelineRunsTable).values({
      userId: params.userId,
      conversationId: params.conversationId ?? null,
      pipelineName: params.pipelineName ?? "standard",
      triggerEvent: params.triggerEvent ?? "user_message",
      status: "running",
      executionOrder: [],
    }).returning();
    return run.id;
  }

  async completeRun(
    runId: string,
    updates: {
      status: string;
      executionOrder: string[];
      consensusSummary?: string;
      responseContent?: string;
      totalDurationMs: number;
      totalAgents: number;
      successfulAgents: number;
      failedAgents: number;
    },
  ): Promise<void> {
    await db.update(agentPipelineRunsTable)
      .set({
        status: updates.status,
        executionOrder: updates.executionOrder,
        consensusSummary: updates.consensusSummary ?? null,
        responseContent: updates.responseContent ?? null,
        totalDurationMs: updates.totalDurationMs,
        totalAgents: updates.totalAgents,
        successfulAgents: updates.successfulAgents,
        failedAgents: updates.failedAgents,
        completedAt: new Date(),
      })
      .where(eq(agentPipelineRunsTable.id, runId));
  }

  async logExecution(entry: ExecutionLogEntry): Promise<string> {
    const [exec] = await db.insert(agentExecutionsTable).values({
      pipelineRunId: entry.pipelineRunId,
      userId: entry.userId,
      agentName: entry.agentName,
      status: entry.status,
      inputData: entry.inputData,
      outputData: entry.outputData,
      confidence: entry.confidence,
      errorMessage: entry.error ?? null,
      durationMs: entry.durationMs,
      retryCount: entry.retryCount,
      llmProvider: entry.llmProvider ?? null,
      llmModel: entry.llmModel ?? null,
      tokensUsed: entry.tokensUsed ?? null,
      startedAt: new Date(Date.now() - entry.durationMs),
      completedAt: new Date(),
    }).returning();
    return exec.id;
  }

  async logConsensus(decision: ConsensusDecision & { pipelineRunId: string }): Promise<void> {
    await db.insert(agentConsensusDecisionsTable).values({
      pipelineRunId: decision.pipelineRunId,
      category: decision.category,
      consensusText: decision.consensusText,
      confidence: decision.confidence,
      agreementLevel: decision.agreementLevel,
      contributingAgents: decision.contributingAgents,
      dissentingAgents: decision.dissentingAgents,
      disagreements: decision.disagreements as any ?? [],
      resolution: decision.disagreements?.length > 0 ? "resolved" : "unresolved",
    });
  }

  async updateAgentPerformance(agentName: string, durationMs: number, confidence: number, success: boolean): Promise<void> {
    const existing = await db
      .select()
      .from(agentPerformanceMetricsTable)
      .where(eq(agentPerformanceMetricsTable.agentName, agentName))
      .limit(1);

    if (existing.length > 0) {
      const m = existing[0];
      const total = (m.totalExecutions ?? 0) + 1;
      await db.update(agentPerformanceMetricsTable)
        .set({
          totalExecutions: total,
          successfulExecutions: (m.successfulExecutions ?? 0) + (success ? 1 : 0),
          failedExecutions: (m.failedExecutions ?? 0) + (success ? 0 : 1),
          avgDurationMs: Math.round(((m.avgDurationMs ?? 0) * (m.totalExecutions ?? 0) + durationMs) / total),
          avgConfidence: ((m.avgConfidence ?? 0) * (m.totalExecutions ?? 0) + confidence) / total,
          lastExecutionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentPerformanceMetricsTable.id, m.id));
    } else {
      await db.insert(agentPerformanceMetricsTable).values({
        agentName,
        totalExecutions: 1,
        successfulExecutions: success ? 1 : 0,
        failedExecutions: success ? 0 : 1,
        avgDurationMs: durationMs,
        avgConfidence: confidence,
        lastExecutionAt: new Date(),
      });
    }
  }

  async getRun(runId: string): Promise<{
    run: any;
    executions: any[];
    consensus: any[];
  } | null> {
    const [run] = await db
      .select()
      .from(agentPipelineRunsTable)
      .where(eq(agentPipelineRunsTable.id, runId))
      .limit(1);
    if (!run) return null;

    const executions = await db
      .select()
      .from(agentExecutionsTable)
      .where(eq(agentExecutionsTable.pipelineRunId, runId))
      .orderBy(asc(agentExecutionsTable.startedAt));

    const consensus = await db
      .select()
      .from(agentConsensusDecisionsTable)
      .where(eq(agentConsensusDecisionsTable.pipelineRunId, runId));

    return { run, executions, consensus };
  }

  async getRecentRuns(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ runs: any[]; total: number }> {
    const runs = await db
      .select()
      .from(agentPipelineRunsTable)
      .where(eq(agentPipelineRunsTable.userId, userId))
      .orderBy(desc(agentPipelineRunsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ value: drizzleCount() })
      .from(agentPipelineRunsTable)
      .where(eq(agentPipelineRunsTable.userId, userId));

    return { runs, total: Number(countResult?.value ?? 0) };
  }

  async getPerformanceMetrics(): Promise<any[]> {
    return db
      .select()
      .from(agentPerformanceMetricsTable)
      .orderBy(desc(agentPerformanceMetricsTable.totalExecutions));
  }
}
