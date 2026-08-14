import { db, consultationAnalyticsTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import type { ConsultationTelemetry, TrendReport, TrendPoint } from "./types";

export class AnalyticsCollector {
  async recordTelemetry(data: ConsultationTelemetry): Promise<string> {
    const [saved] = await db.insert(consultationAnalyticsTable).values({
      userId: data.userId,
      conversationId: data.conversationId,
      durationMs: data.durationMs,
      followUpCount: data.followUpCount,
      tokensUsed: data.tokensInput + data.tokensOutput,
      tokensInput: data.tokensInput,
      tokensOutput: data.tokensOutput,
      llmProvider: data.llmProvider,
      llmModel: data.llmModel,
      responseLatencyMs: data.responseLatencyMs,
      retrievalLatencyMs: data.retrievalLatencyMs,
      agentExecutionTimeMs: data.agentExecutionTimeMs,
      safetyInterventions: data.safetyInterventions,
      safetyAction: data.safetyAction,
      confidenceScore: data.confidenceScore,
      hallucinationScore: data.hallucinationScore,
      qualityScore: data.qualityScore,
      finalRiskCategory: data.finalRiskCategory,
      recommendationCategory: data.recommendationCategory,
      retrievalSuccess: data.retrievalSuccess,
      chunksRetrieved: data.chunksRetrieved,
      hadEscalation: data.hadEscalation,
      hadFallback: data.hadFallback,
      errorType: data.errorType,
      errorMessage: data.errorMessage,
    }).returning();

    return saved.id;
  }

  async getConsultationAnalytics(conversationId: string): Promise<any> {
    const [record] = await db.select()
      .from(consultationAnalyticsTable)
      .where(eq(consultationAnalyticsTable.conversationId, conversationId))
      .limit(1);
    return record || null;
  }

  async getUserAnalytics(userId: string, limit = 50, offset = 0) {
    return db.select()
      .from(consultationAnalyticsTable)
      .where(eq(consultationAnalyticsTable.userId, userId))
      .orderBy(desc(consultationAnalyticsTable.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getUsageTrends(days = 30): Promise<TrendReport> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Daily consultations
    const daily = await db.select({
      date: sql<string>`DATE(${consultationAnalyticsTable.createdAt})`,
      value: count(),
    })
      .from(consultationAnalyticsTable)
      .where(gte(consultationAnalyticsTable.createdAt, since))
      .groupBy(sql`DATE(${consultationAnalyticsTable.createdAt})`)
      .orderBy(sql`DATE(${consultationAnalyticsTable.createdAt})`);

    // Weekly
    const weekly = await db.select({
      date: sql<string>`DATE_TRUNC('week', ${consultationAnalyticsTable.createdAt})`,
      value: count(),
    })
      .from(consultationAnalyticsTable)
      .where(gte(consultationAnalyticsTable.createdAt, since))
      .groupBy(sql`DATE_TRUNC('week', ${consultationAnalyticsTable.createdAt})`)
      .orderBy(sql`DATE_TRUNC('week', ${consultationAnalyticsTable.createdAt})`);

    // Monthly
    const monthly = await db.select({
      date: sql<string>`DATE_TRUNC('month', ${consultationAnalyticsTable.createdAt})`,
      value: count(),
    })
      .from(consultationAnalyticsTable)
      .where(gte(consultationAnalyticsTable.createdAt, since))
      .groupBy(sql`DATE_TRUNC('month', ${consultationAnalyticsTable.createdAt})`)
      .orderBy(sql`DATE_TRUNC('month', ${consultationAnalyticsTable.createdAt})`);

    return {
      daily: daily.map((r) => ({ date: r.date, value: Number(r.value) })),
      weekly: weekly.map((r) => ({ date: r.date, value: Number(r.value) })),
      monthly: monthly.map((r) => ({ date: r.date, value: Number(r.value) })),
    };
  }

  async getAggregatedStats(userId?: string) {
    const conditions = userId ? [eq(consultationAnalyticsTable.userId, userId)] : [];

    const [total] = await db.select({ value: count() })
      .from(consultationAnalyticsTable)
      .where(and(...conditions));

    const [avgTokens] = await db.select({ value: sql<number>`avg(tokens_used)` })
      .from(consultationAnalyticsTable)
      .where(and(...conditions));

    const [avgLatency] = await db.select({ value: sql<number>`avg(response_latency_ms)` })
      .from(consultationAnalyticsTable)
      .where(and(...conditions));

    const [safetyInterventions] = await db.select({ value: sql<number>`sum(safety_interventions)` })
      .from(consultationAnalyticsTable)
      .where(and(...conditions));

    const [avgConfidence] = await db.select({ value: sql<number>`avg(confidence_score)` })
      .from(consultationAnalyticsTable)
      .where(and(...conditions));

    const [avgQuality] = await db.select({ value: sql<number>`avg(quality_score)` })
      .from(consultationAnalyticsTable)
      .where(and(...conditions));

    // Risk distribution
    const riskDistribution = await db.select({
      category: consultationAnalyticsTable.finalRiskCategory,
      value: count(),
    })
      .from(consultationAnalyticsTable)
      .where(and(...conditions, sql`final_risk_category IS NOT NULL`))
      .groupBy(consultationAnalyticsTable.finalRiskCategory);

    // Recommendation distribution
    const recDistribution = await db.select({
      category: consultationAnalyticsTable.recommendationCategory,
      value: count(),
    })
      .from(consultationAnalyticsTable)
      .where(and(...conditions, sql`recommendation_category IS NOT NULL`))
      .groupBy(consultationAnalyticsTable.recommendationCategory);

    // Provider distribution
    const providerDistribution = await db.select({
      provider: consultationAnalyticsTable.llmProvider,
      value: count(),
    })
      .from(consultationAnalyticsTable)
      .where(and(...conditions, sql`llm_provider IS NOT NULL`))
      .groupBy(consultationAnalyticsTable.llmProvider);

    return {
      totalConsultations: Number(total.value),
      avgTokensUsed: Math.round(Number(avgTokens.value) || 0),
      avgLatencyMs: Math.round(Number(avgLatency.value) || 0),
      totalSafetyInterventions: Number(safetyInterventions.value) || 0,
      avgConfidenceScore: Math.round(Number(avgConfidence.value) || 0),
      avgQualityScore: Math.round(Number(avgQuality.value) || 0),
      riskDistribution: riskDistribution.map((r) => ({ category: r.category, count: Number(r.value) })),
      recommendationDistribution: recDistribution.map((r) => ({ category: r.category, count: Number(r.value) })),
      providerDistribution: providerDistribution.map((r) => ({ provider: r.provider, count: Number(r.value) })),
    };
  }
}
