import { Router, type IRouter } from "express";
import { requireAdmin, type AdminRequest } from "../middlewares/requireAdmin";
import { db, safetyEvaluationsTable, safetyViolationsTable, hallucinationEventsTable, regressionTestRunsTable } from "@workspace/db";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";
import { SafetyFramework } from "../lib/safety/framework";
import { RegressionTestRunner } from "../lib/safety/regression/testRunner";
import { RegressionReporter } from "../lib/safety/regression/reporter";
import { medicalTestScenarios } from "../lib/safety/regression/testSuite";

const router: IRouter = Router();

let safetyFramework: SafetyFramework | null = null;

function getFramework(): SafetyFramework {
  if (!safetyFramework) {
    safetyFramework = new SafetyFramework();
  }
  return safetyFramework;
}

// ─── Get guardrail configuration ───

router.get("/safety-admin/guardrails", requireAdmin, async (_req, res) => {
  try {
    const framework = getFramework();
    res.json({
      guardrails: framework["config"].guardrails.map((g) => ({
        name: g.name,
        enabled: g.enabled,
        severity: g.severity,
        action: g.action,
        threshold: g.threshold,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Update guardrail configuration ───

router.post("/safety-admin/guardrails", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { name, enabled, severity, action, threshold } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const framework = getFramework();
    const guardrail = framework["config"].guardrails.find((g) => g.name === name);
    if (!guardrail) {
      res.status(404).json({ error: `Guardrail '${name}' not found` });
      return;
    }

    if (enabled !== undefined) guardrail.enabled = enabled;
    if (severity) guardrail.severity = severity;
    if (action) guardrail.action = action;
    if (threshold !== undefined) guardrail.threshold = threshold;

    res.json({ message: "Guardrail updated", guardrail });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Run regression test suite ───

router.post("/safety-admin/regression/run", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const { suiteName, scenarioIds } = req.body;
    const name = suiteName || "manual_regression_run";

    const scenarios = scenarioIds
      ? medicalTestScenarios.filter((s) => scenarioIds.includes(s.id))
      : medicalTestScenarios;

    if (scenarios.length === 0) {
      res.status(400).json({ error: "No valid scenarios found" });
      return;
    }

    const framework = getFramework();
    const runner = new RegressionTestRunner(framework);
    const reporter = new RegressionReporter();

    // Create DB record
    const [runRecord] = await db.insert(regressionTestRunsTable).values({
      suiteName: name,
      version: "1.0",
      status: "running",
      totalTests: scenarios.length,
    }).returning();

    // Run tests
    const { results, totalTime } = await runner.runSuite(scenarios);

    // Generate report
    const report = reporter.generateReport(runRecord.id, name, results, totalTime);

    // Update DB
    await db.update(regressionTestRunsTable)
      .set({
        status: "completed",
        passed: report.passed,
        failed: report.failed,
        warnings: report.warnings,
        hallucinationCount: report.hallucinationCount,
        safetyViolations: report.safetyViolations,
        avgLatencyMs: report.avgLatencyMs,
        avgConfidence: report.avgConfidence,
        reportData: report as any,
        completedAt: new Date(),
      })
      .where(eq(regressionTestRunsTable.id, runRecord.id));

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Get regression test runs ───

router.get("/safety-admin/regression/runs", requireAdmin, async (_req, res) => {
  try {
    const limit = Math.min(parseInt(_req.query.limit as string) || 20, 100);

    const runs = await db.select()
      .from(regressionTestRunsTable)
      .orderBy(desc(regressionTestRunsTable.createdAt))
      .limit(limit);

    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Get regression test run detail ───

router.get("/safety-admin/regression/runs/:id", requireAdmin, async (req: AdminRequest, res) => {
  try {
    const [run] = await db.select()
      .from(regressionTestRunsTable)
      .where(eq(regressionTestRunsTable.id, req.params.id as string))
      .limit(1);

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    res.json(run);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Get available test scenarios ───

router.get("/safety-admin/regression/scenarios", requireAdmin, async (_req, res) => {
  try {
    const category = _req.query.category as string;
    const scenarios = category
      ? medicalTestScenarios.filter((s) => s.category === category)
      : medicalTestScenarios;

    res.json(scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      expectedChecks: s.expectedChecks.length,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Global safety stats ───

router.get("/safety-admin/stats", requireAdmin, async (_req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalEvals] = await db.select({ count: count() })
      .from(safetyEvaluationsTable);

    const [blocked24h] = await db.select({ count: count() })
      .from(safetyEvaluationsTable)
      .where(and(
        eq(safetyEvaluationsTable.action, "block"),
        gte(safetyEvaluationsTable.createdAt, last24h),
      ));

    const [rewrites24h] = await db.select({ count: count() })
      .from(safetyEvaluationsTable)
      .where(and(
        eq(safetyEvaluationsTable.action, "rewrite"),
        gte(safetyEvaluationsTable.createdAt, last24h),
      ));

    const [violations7d] = await db.select({ count: count() })
      .from(safetyViolationsTable)
      .where(gte(safetyViolationsTable.createdAt, last7d));

    const [injections30d] = await db.select({ count: count() })
      .from(hallucinationEventsTable)
      .where(gte(hallucinationEventsTable.createdAt, last30d));

    // Action breakdown
    const actionBreakdown = await db.select({
      action: sql<string>`action`,
      count: count(),
    })
      .from(safetyEvaluationsTable)
      .groupBy(sql`action`);

    // Violations by category
    const violationsByCategory = await db.select({
      category: sql<string>`validator_name`,
      count: count(),
    })
      .from(safetyViolationsTable)
      .where(gte(safetyViolationsTable.createdAt, last7d))
      .groupBy(sql`validator_name`)
      .orderBy(desc(count()));

    res.json({
      totalEvaluations: totalEvals.count,
      blockedLast24h: blocked24h.count,
      rewritesLast24h: rewrites24h.count,
      violationsLast7d: violations7d.count,
      highRiskEventsLast30d: injections30d.count,
      actionBreakdown: actionBreakdown.reduce((acc, r) => ({ ...acc, [r.action]: r.count }), {}),
      violationsByCategory,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
