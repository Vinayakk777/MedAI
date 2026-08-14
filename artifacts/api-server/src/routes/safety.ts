import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { db, safetyEvaluationsTable, safetyViolationsTable, hallucinationEventsTable, qualityScoresTable, promptInjectionAttemptsTable, regressionTestRunsTable } from "@workspace/db";
import { eq, desc, and, sql, count, gte, lte } from "drizzle-orm";
import { SafetyFramework } from "../lib/safety/framework";

const router: IRouter = Router();

let safetyFramework: SafetyFramework | null = null;

function getFramework(): SafetyFramework {
  if (!safetyFramework) {
    safetyFramework = new SafetyFramework();
  }
  return safetyFramework;
}

// ─── Evaluate a response for safety ───

router.post("/safety/evaluate", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { responseText, queryText, patientData } = req.body;
    if (!responseText || !queryText) {
      res.status(400).json({ error: "responseText and queryText are required" });
      return;
    }

    const framework = getFramework();
    const evaluation = await framework.evaluate(responseText, {
      userId: req.userId,
      queryText,
      patientData,
    });

    // Persist to DB
    const [saved] = await db.insert(safetyEvaluationsTable).values({
      userId: req.userId,
      responseText: evaluation.responseText,
      queryText: evaluation.queryText,
      overallStatus: evaluation.overallStatus,
      action: evaluation.action,
      fallbackMessage: evaluation.fallbackMessage,
      originalResponse: evaluation.originalResponse,
      passedCount: evaluation.results.filter((r) => r.status === "passed").length,
      warningCount: evaluation.results.filter((r) => r.status === "warning").length,
      failedCount: evaluation.results.filter((r) => r.status === "failed").length,
      qualityScore: evaluation.scores.qualityScore,
      hallucinationScore: evaluation.scores.hallucinationScore,
      confidenceScore: evaluation.scores.confidenceScore,
      clinicalRiskScore: evaluation.scores.clinicalRiskScore,
      latencyMs: evaluation.latencyMs,
    }).returning();

    res.json({ evaluationId: saved.id, ...evaluation });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Get evaluation history ───

router.get("/safety/evaluations", requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const conditions = [eq(safetyEvaluationsTable.userId, req.userId)];
    if (status) conditions.push(eq(safetyEvaluationsTable.overallStatus, status));

    const results = await db.select()
      .from(safetyEvaluationsTable)
      .where(and(...conditions))
      .orderBy(desc(safetyEvaluationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Get evaluation detail ───

router.get("/safety/evaluations/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [evaluation] = await db.select()
      .from(safetyEvaluationsTable)
      .where(eq(safetyEvaluationsTable.id, req.params.id as string))
      .limit(1);

    if (!evaluation) {
      res.status(404).json({ error: "Evaluation not found" });
      return;
    }

    // Fetch violations
    const violations = await db.select()
      .from(safetyViolationsTable)
      .where(eq(safetyViolationsTable.evaluationId, evaluation.id));

    res.json({ ...evaluation, violations });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Get safety violations ───

router.get("/safety/violations", requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const severity = req.query.severity as string;

    const conditions = [eq(safetyViolationsTable.userId, req.userId)];
    if (severity) conditions.push(eq(safetyViolationsTable.severity, severity));

    const results = await db.select()
      .from(safetyViolationsTable)
      .where(and(...conditions))
      .orderBy(desc(safetyViolationsTable.createdAt))
      .limit(limit);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Get hallucination events ───

router.get("/safety/hallucinations", requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const results = await db.select()
      .from(hallucinationEventsTable)
      .where(eq(hallucinationEventsTable.userId, req.userId))
      .orderBy(desc(hallucinationEventsTable.createdAt))
      .limit(limit);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Get quality scores ───

router.get("/safety/quality", requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    const results = await db.select()
      .from(qualityScoresTable)
      .where(eq(qualityScoresTable.userId, req.userId))
      .orderBy(desc(qualityScoresTable.createdAt))
      .limit(limit);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Dashboard summary ───

router.get("/safety/summary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalEvals] = await db.select({ count: count() })
      .from(safetyEvaluationsTable)
      .where(eq(safetyEvaluationsTable.userId, userId));

    const [violations24h] = await db.select({ count: count() })
      .from(safetyViolationsTable)
      .where(and(
        eq(safetyViolationsTable.userId, userId),
        gte(safetyViolationsTable.createdAt, last24h),
      ));

    const [hallucinations7d] = await db.select({ count: count() })
      .from(hallucinationEventsTable)
      .where(and(
        eq(hallucinationEventsTable.userId, userId),
        gte(hallucinationEventsTable.createdAt, last7d),
      ));

    // Average quality score
    const [qualityResult] = await db.select({ avg: sql<number>`avg(${qualityScoresTable.overallScore})` })
      .from(qualityScoresTable)
      .where(eq(qualityScoresTable.userId, userId));

    // Average confidence
    const [confidenceResult] = await db.select({ avg: sql<number>`avg(${safetyEvaluationsTable.confidenceScore})` })
      .from(safetyEvaluationsTable)
      .where(eq(safetyEvaluationsTable.userId, userId));

    // Blocked counts
    const [blockedCount] = await db.select({ count: count() })
      .from(safetyEvaluationsTable)
      .where(and(
        eq(safetyEvaluationsTable.userId, userId),
        eq(safetyEvaluationsTable.action, "block"),
      ));

    res.json({
      totalEvaluations: totalEvals.count,
      violationsLast24h: violations24h.count,
      hallucinationsLast7d: hallucinations7d.count,
      averageQualityScore: Math.round((qualityResult.avg ?? 0) * 100) / 100,
      averageConfidenceScore: Math.round((confidenceResult.avg ?? 0) * 100) / 100,
      totalBlocked: blockedCount.count,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
