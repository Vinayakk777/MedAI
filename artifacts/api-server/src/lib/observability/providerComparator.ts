import { db, providerPerformanceTable, providerCallLogsTable } from "@workspace/db";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";
import type { ProviderCallRecord, ProviderComparison } from "./types";

export class ProviderComparator {
  async recordCall(data: ProviderCallRecord): Promise<string> {
    const cost = this.calculateCost(data.provider, data.model, data.tokensInput, data.tokensOutput);

    const [saved] = await db.insert(providerCallLogsTable).values({
      conversationId: data.conversationId,
      provider: data.provider,
      model: data.model,
      taskType: data.taskType,
      latencyMs: data.latencyMs,
      tokensInput: data.tokensInput,
      tokensOutput: data.tokensOutput,
      cost,
      success: data.success,
      errorType: data.errorType,
      statusCode: data.statusCode,
    }).returning();

    return saved.id;
  }

  async getProviderComparison(): Promise<ProviderComparison[]> {
    const results = await db.select({
      provider: providerCallLogsTable.provider,
      model: providerCallLogsTable.model,
      totalCalls: count(),
      avgLatencyMs: sql<number>`avg(${providerCallLogsTable.latencyMs})`,
      p95LatencyMs: sql<number>`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${providerCallLogsTable.latencyMs})`,
      p99LatencyMs: sql<number>`percentile_cont(0.99) WITHIN GROUP (ORDER BY ${providerCallLogsTable.latencyMs})`,
      failureRate: sql<number>`avg(case when success = false then 1 else 0 end) * 100`,
      avgCost: sql<number>`avg(${providerCallLogsTable.cost})`,
    })
      .from(providerCallLogsTable)
      .groupBy(providerCallLogsTable.provider, providerCallLogsTable.model);

    return results.map((r) => ({
      provider: r.provider,
      model: r.model,
      totalCalls: Number(r.totalCalls),
      avgLatencyMs: Math.round(Number(r.avgLatencyMs) || 0),
      p95LatencyMs: Math.round(Number(r.p95LatencyMs) || 0),
      p99LatencyMs: Math.round(Number(r.p99LatencyMs) || 0),
      failureRate: Math.round(Number(r.failureRate) * 100) / 100,
      avgCostPerCall: Math.round(Number(r.avgCost) * 100000) / 100000,
    }));
  }

  async getProviderHistory(provider: string, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return db.select()
      .from(providerPerformanceTable)
      .where(and(
        eq(providerPerformanceTable.provider, provider),
        gte(providerPerformanceTable.periodStart, since),
      ))
      .orderBy(desc(providerPerformanceTable.periodStart));
  }

  async getProviderCallLogs(limit = 100, offset = 0) {
    return db.select()
      .from(providerCallLogsTable)
      .orderBy(desc(providerCallLogsTable.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getRecommendedProvider(taskType: string): Promise<{ provider: string; model: string } | null> {
    const providers = await this.getProviderComparison();
    if (providers.length === 0) return null;

    // Score each provider based on latency, reliability, and quality
    const scored = providers.map((p) => {
      const latencyScore = Math.max(0, 100 - (p.avgLatencyMs / 20));
      const reliabilityScore = 100 - p.failureRate;
      const totalScore = latencyScore * 0.4 + reliabilityScore * 0.6;
      return { ...p, totalScore };
    });

    scored.sort((a, b) => b.totalScore - a.totalScore);
    return { provider: scored[0].provider, model: scored[0].model };
  }

  private calculateCost(provider: string, _model: string, input: number, output: number): number {
    const rates: Record<string, { input: number; output: number }> = {
      gemini: { input: 0.000000125, output: 0.000000375 },
      groq: { input: 0.00000015, output: 0.00000060 },
      openai: { input: 0.00000050, output: 0.00000150 },
      claude: { input: 0.00000080, output: 0.00000240 },
      local: { input: 0.00000001, output: 0.00000001 },
    };
    const rate = rates[provider] || { input: 0.00000015, output: 0.00000060 };
    return (input * rate.input + output * rate.output);
  }
}
