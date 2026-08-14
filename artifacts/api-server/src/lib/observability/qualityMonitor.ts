import { db, aiQualityMetricsTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { QualityMetricSnapshot } from "./types";

export class QualityMonitor {
  async recordSnapshot(snapshot: QualityMetricSnapshot): Promise<string> {
    const [saved] = await db.insert(aiQualityMetricsTable).values({
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      resolution: snapshot.resolution,
      avgConfidenceScore: snapshot.avgConfidenceScore,
      avgHallucinationScore: snapshot.avgHallucinationScore,
      avgQualityScore: snapshot.avgQualityScore,
      totalEvaluations: snapshot.totalConsultations,
      hallucinationIncidents: snapshot.hallucinationIncidents,
      safetyViolations: snapshot.safetyViolations,
      escalationFrequency: snapshot.escalationFrequency,
      falseEmergencyAlerts: snapshot.falseEmergencyAlerts,
      lowConfidenceResponses: snapshot.lowConfidenceResponses,
      modelFallbackCount: snapshot.modelFallbackCount,
      retrievalSuccessRate: snapshot.retrievalSuccessRate,
      avgResponseLatencyMs: snapshot.avgResponseLatencyMs,
      activeUsers: snapshot.activeUsers,
      totalConsultations: snapshot.totalConsultations,
      satisfactionScore: snapshot.satisfactionScore,
    }).returning();

    return saved.id;
  }

  async getMetricsHistory(resolution: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return db.select()
      .from(aiQualityMetricsTable)
      .where(and(
        eq(aiQualityMetricsTable.resolution, resolution),
        gte(aiQualityMetricsTable.periodStart, since),
      ))
      .orderBy(desc(aiQualityMetricsTable.periodStart));
  }

  async getLatestMetrics() {
    const [latest] = await db.select()
      .from(aiQualityMetricsTable)
      .where(eq(aiQualityMetricsTable.resolution, "daily"))
      .orderBy(desc(aiQualityMetricsTable.periodStart))
      .limit(1);

    return latest || null;
  }

  async getDashboardMetrics() {
    const latest = await this.getLatestMetrics();

    // Trend: average quality over last 30 days
    const monthlyTrend = await this.getMetricsHistory("daily", 30);

    // Hallucination incidents total
    const [totalHallucinations] = await db.select({
      value: sql<number>`sum(hallucination_incidents)`,
    }).from(aiQualityMetricsTable)
      .where(eq(aiQualityMetricsTable.resolution, "daily"));

    return {
      current: {
        avgConfidence: latest?.avgConfidenceScore ?? 0,
        avgQuality: latest?.avgQualityScore ?? 0,
        avgHallucination: latest?.avgHallucinationScore ?? 0,
        hallucinationIncidents: latest?.hallucinationIncidents ?? 0,
        safetyViolations: latest?.safetyViolations ?? 0,
        escalationFrequency: latest?.escalationFrequency ?? 0,
        falseEmergencyAlerts: latest?.falseEmergencyAlerts ?? 0,
        lowConfidenceResponses: latest?.lowConfidenceResponses ?? 0,
        modelFallbackCount: latest?.modelFallbackCount ?? 0,
        retrievalSuccessRate: latest?.retrievalSuccessRate ?? 0,
        avgLatencyMs: latest?.avgResponseLatencyMs ?? 0,
        activeUsers: latest?.activeUsers ?? 0,
        totalConsultations: latest?.totalConsultations ?? 0,
        satisfactionScore: latest?.satisfactionScore ?? 0,
      },
      trend: monthlyTrend.map((m) => ({
        date: m.periodStart,
        avgConfidence: m.avgConfidenceScore,
        avgQuality: m.avgQualityScore,
        avgHallucination: m.avgHallucinationScore,
        safetyViolations: m.safetyViolations,
        satisfactionScore: m.satisfactionScore,
      })),
      totalHallucinationIncidents: Number(totalHallucinations.value) || 0,
    };
  }
}
