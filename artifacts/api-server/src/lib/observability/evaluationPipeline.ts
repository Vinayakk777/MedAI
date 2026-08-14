import { db, evaluationRunsTable, evaluationResultsTable } from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import type { EvaluationScenario, EvaluationCheckResult } from "./types";
import { medicalTestScenarios } from "../safety/regression/testSuite";

type EvaluatorFn = (scenario: EvaluationScenario) => Promise<EvaluationCheckResult>;

export class EvaluationPipeline {
  private evaluator: EvaluatorFn;

  constructor(evaluator: EvaluatorFn) {
    this.evaluator = evaluator;
  }

  async runEvaluation(name: string, scenarios?: EvaluationScenario[], triggeredBy = "manual"): Promise<any> {
    const testScenarios = scenarios || this.getBenchmarkScenarios();

    // Create run record
    const [run] = await db.insert(evaluationRunsTable).values({
      name,
      status: "running",
      totalScenarios: testScenarios.length,
      triggeredBy,
    }).returning();

    const results: EvaluationCheckResult[] = [];
    let passed = 0;
    let totalAccuracy = 0;
    let totalSafety = 0;
    let totalConsistency = 0;
    let totalFollowUp = 0;
    let totalLatency = 0;

    for (const scenario of testScenarios) {
      try {
        const result = await this.evaluator(scenario);
        results.push(result);

        if (result.passed) passed++;
        if (result.accuracyScore) totalAccuracy += result.accuracyScore;
        if (result.safetyScore) totalSafety += result.safetyScore;
        if (result.consistencyScore) totalConsistency += result.consistencyScore;
        if (result.followUpScore) totalFollowUp += result.followUpScore;
        if (result.latencyMs) totalLatency += result.latencyMs;

        await db.insert(evaluationResultsTable).values({
          runId: run.id,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          passed: result.passed,
          accuracyScore: result.accuracyScore,
          safetyScore: result.safetyScore,
          consistencyScore: result.consistencyScore,
          followUpScore: result.followUpScore,
          latencyMs: result.latencyMs,
          errors: result.errors,
          details: result.details || {},
        });
      } catch (err) {
        results.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          passed: false,
          errors: `Evaluator error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const n = results.length;
    const report = {
      totalScenarios: n,
      passed,
      failed: n - passed,
      passedRate: n > 0 ? (passed / n) * 100 : 0,
      avgAccuracy: n > 0 ? totalAccuracy / n : 0,
      avgSafetyScore: n > 0 ? totalSafety / n : 0,
      avgConsistency: n > 0 ? totalConsistency / n : 0,
      avgFollowUpQuality: n > 0 ? totalFollowUp / n : 0,
      avgLatencyMs: n > 0 ? totalLatency / n : 0,
      results,
    };

    // Update run record
    await db.update(evaluationRunsTable).set({
      status: "completed",
      passed: report.passed,
      failed: report.failed,
      avgAccuracy: report.avgAccuracy,
      avgSafetyScore: report.avgSafetyScore,
      avgDiagnosisConsistency: report.avgConsistency,
      avgFollowUpQuality: report.avgFollowUpQuality,
      avgLatencyMs: report.avgLatencyMs,
      reportData: report as any,
      completedAt: new Date(),
    }).where(eq(evaluationRunsTable.id, run.id));

    return { runId: run.id, ...report };
  }

  async getRunHistory(limit = 20) {
    return db.select()
      .from(evaluationRunsTable)
      .orderBy(desc(evaluationRunsTable.createdAt))
      .limit(limit);
  }

  async getRunDetail(runId: string) {
    const [run] = await db.select()
      .from(evaluationRunsTable)
      .where(eq(evaluationRunsTable.id, runId))
      .limit(1);

    if (!run) return null;

    const results = await db.select()
      .from(evaluationResultsTable)
      .where(eq(evaluationResultsTable.runId, runId));

    return { ...run, results };
  }

  async compareRuns(runA: string, runB: string) {
    const [a, b] = await Promise.all([this.getRunDetail(runA), this.getRunDetail(runB)]);
    if (!a || !b) throw new Error("Run not found");

    return {
      runA: {
        id: a.id,
        name: a.name,
        passed: a.passed ?? 0,
        failed: a.failed ?? 0,
        passRate: (a.totalScenarios ?? 0) > 0 ? ((a.passed ?? 0) / (a.totalScenarios ?? 1)) * 100 : 0,
        avgAccuracy: a.avgAccuracy,
        avgSafetyScore: a.avgSafetyScore,
        avgLatencyMs: a.avgLatencyMs,
        createdAt: a.createdAt,
      },
      runB: {
        id: b.id,
        name: b.name,
        passed: b.passed ?? 0,
        failed: b.failed ?? 0,
        passRate: (b.totalScenarios ?? 0) > 0 ? ((b.passed ?? 0) / (b.totalScenarios ?? 1)) * 100 : 0,
        avgAccuracy: b.avgAccuracy,
        avgSafetyScore: b.avgSafetyScore,
        avgLatencyMs: b.avgLatencyMs,
        createdAt: b.createdAt,
      },
      deltas: {
        passRate: ((b.passed ?? 0) / ((b.totalScenarios ?? 1)) * 100) - ((a.passed ?? 0) / ((a.totalScenarios ?? 1)) * 100),
        avgAccuracy: (b.avgAccuracy ?? 0) - (a.avgAccuracy ?? 0),
        avgSafetyScore: (b.avgSafetyScore ?? 0) - (a.avgSafetyScore ?? 0),
        avgLatencyMs: (b.avgLatencyMs ?? 0) - (a.avgLatencyMs ?? 0),
      },
    };
  }

  private getBenchmarkScenarios(): EvaluationScenario[] {
    return medicalTestScenarios.map((s) => ({
      id: s.id,
      name: s.name,
      query: s.patientMessage,
      expectedOutcome: s.expectedChecks.map((c) => `${c.field} ${c.operator} ${c.value}`).join("; "),
      category: s.category,
    }));
  }
}
