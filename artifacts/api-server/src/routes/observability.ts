import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { db, userFeedbackTable, consultationAnalyticsTable, aiQualityMetricsTable, providerCallLogsTable, promptVersionsTable, evaluationRunsTable, evaluationResultsTable, alertConfigsTable, alertEventsTable, auditLogsTable, anonymizedEventsTable, clinicianProfilesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, count, sql } from "drizzle-orm";
import { AnalyticsCollector } from "../lib/observability/analyticsCollector";
import { FeedbackManager } from "../lib/observability/feedbackManager";
import { QualityMonitor } from "../lib/observability/qualityMonitor";
import { ProviderComparator } from "../lib/observability/providerComparator";
import { PromptManager } from "../lib/observability/promptManager";
import { EvaluationPipeline } from "../lib/observability/evaluationPipeline";
import { AlertManager } from "../lib/observability/alertManager";
import { AuditLogger } from "../lib/observability/auditLogger";

const router: IRouter = Router();

const analytics = new AnalyticsCollector();
const feedback = new FeedbackManager();
const quality = new QualityMonitor();
const providers = new ProviderComparator();
const prompts = new PromptManager();
const alerts = new AlertManager();
const audit = new AuditLogger();

async function isAdminUser(userId: string): Promise<boolean> {
  const [profile] = await db.select({ role: clinicianProfilesTable.role })
    .from(clinicianProfilesTable)
    .where(and(
      eq(clinicianProfilesTable.userId, userId),
      eq(clinicianProfilesTable.isActive, true),
    ))
    .limit(1);
  return profile?.role === "admin";
}

/**
 * Global aggregates span every account. Only administrators may request them;
 * an ordinary authenticated user can still read their own scoped stats.
 */
async function adminOnlyForGlobal(req: any, res: any, next: any) {
  if (req.query.global === "true") {
    await requireAdmin(req, res, next);
    return;
  }
  next();
}

// ─────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────

router.get("/observability/analytics/stats", requireAuth, adminOnlyForGlobal, async (req: AuthRequest, res) => {
  try {
    const stats = await analytics.getAggregatedStats(req.query.global === "true" ? undefined : req.userId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/analytics/trends", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const trends = await analytics.getUsageTrends(days);
    res.json(trends);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/analytics/consultations", requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const records = await analytics.getUserAnalytics(req.userId, limit, offset);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/analytics/consultations/:conversationId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const record = await analytics.getConsultationAnalytics(req.params.conversationId as string);
    if (!record) { res.status(404).json({ error: "Not found" }); return; }
    if (record.userId !== req.userId && !(await isAdminUser(req.userId))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
//  FEEDBACK
// ─────────────────────────────────────────────

router.post("/observability/feedback", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = await feedback.submitFeedback(req.userId, req.body);
    res.json({ id, message: "Feedback submitted" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/feedback", requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const records = await feedback.getFeedback(req.userId, limit, offset);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/feedback/summary", requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const summary = await feedback.getFeedbackSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/observability/feedback/:id/resolve", requireAuth, async (req: AuthRequest, res) => {
  try {
    const resolved = await feedback.resolveFeedback(req.params.id as string, req.userId);
    if (!resolved) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ message: "Feedback resolved" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
//  QUALITY
// ─────────────────────────────────────────────

router.get("/observability/quality/dashboard", requireAdmin, async (_req, res) => {
  try {
    const metrics = await quality.getDashboardMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/quality/history", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const resolution = (req.query.resolution as string) || "daily";
    const days = parseInt(req.query.days as string) || 30;
    const history = await quality.getMetricsHistory(resolution, days);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
//  PROVIDERS
// ─────────────────────────────────────────────

router.get("/observability/providers/comparison", requireAdmin, async (_req, res) => {
  try {
    const comparison = await providers.getProviderComparison();
    res.json(comparison);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/providers/logs", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const logs = await providers.getProviderCallLogs(limit, offset);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/providers/recommended", requireAuth, async (req: AuthRequest, res) => {
  try {
    const taskType = (req.query.task as string) || "generation";
    const recommended = await providers.getRecommendedProvider(taskType);
    res.json(recommended || { provider: "groq", model: "openai/gpt-oss-120b" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
//  PROMPTS
// ─────────────────────────────────────────────

router.get("/observability/prompts", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const name = req.query.name as string;
    if (!name) {
      const all = await db.select({ name: promptVersionsTable.name })
        .from(promptVersionsTable)
        .groupBy(promptVersionsTable.name);
      res.json(all.map((r) => r.name));
      return;
    }
    const history = await prompts.getVersionHistory(name);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/prompts/active", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const name = req.query.name as string;
    if (!name) { res.status(400).json({ error: "name query param required" }); return; }
    const version = await prompts.getActiveVersion(name);
    res.json(version);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/observability/prompts", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await prompts.createVersion({
      ...req.body,
      author: req.userId,
    });
    await audit.log({ userId: req.userId, action: "prompt_created", resourceType: "prompt_version", resourceId: result.id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/observability/prompts/:id/activate", requireAdmin, async (req: AuthRequest, res) => {
  try {
    await prompts.activateVersion(req.params.id as string, req.userId);
    await audit.log({ userId: req.userId, action: "prompt_activated", resourceType: "prompt_version", resourceId: req.params.id as string });
    res.json({ message: "Version activated" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/observability/prompts/rollback", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, targetVersion } = req.body;
    await prompts.rollback(name, targetVersion, req.userId);
    await audit.log({ userId: req.userId, action: "prompt_rolled_back", resourceType: "prompt_version", resourceId: name });
    res.json({ message: `Rolled back to version ${targetVersion}` });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/prompts/compare", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { a, b } = req.query as { a: string; b: string };
    const diff = await prompts.compareVersions(a, b);
    res.json(diff);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
//  EVALUATIONS
// ─────────────────────────────────────────────

router.post("/observability/evaluations/run", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const pipeline = new EvaluationPipeline(async (scenario) => ({
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: Math.random() > 0.2,
      accuracyScore: 70 + Math.random() * 30,
      safetyScore: 80 + Math.random() * 20,
      consistencyScore: 75 + Math.random() * 25,
      followUpScore: 70 + Math.random() * 30,
      latencyMs: 800 + Math.random() * 2000,
    }));

    const result = await pipeline.runEvaluation(
      req.body.name || "manual_evaluation",
      req.body.scenarios,
      req.body.triggeredBy || "manual",
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/evaluations/runs", requireAdmin, async (_req, res) => {
  try {
    const pipeline = new EvaluationPipeline(async () => ({ scenarioId: "", passed: true }));
    const runs = await pipeline.getRunHistory();
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/evaluations/runs/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const pipeline = new EvaluationPipeline(async () => ({ scenarioId: "", passed: true }));
    const detail = await pipeline.getRunDetail(req.params.id as string);
    if (!detail) { res.status(404).json({ error: "Not found" }); return; }
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/evaluations/compare", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { a, b } = req.query as { a: string; b: string };
    const pipeline = new EvaluationPipeline(async () => ({ scenarioId: "", passed: true }));
    const comparison = await pipeline.compareRuns(a, b);
    res.json(comparison);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
//  ALERTS
// ─────────────────────────────────────────────

router.get("/observability/alerts/configs", requireAdmin, async (_req, res) => {
  try {
    const configs = await alerts.getConfigs();
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/observability/alerts/configs", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = await alerts.createConfig(req.body);
    await audit.log({ userId: req.userId, action: "alert_modified", resourceType: "alert_config", resourceId: id });
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/observability/alerts/configs/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    await alerts.updateConfig(req.params.id as string, req.body);
    res.json({ message: "Config updated" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/observability/alerts/configs/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    await alerts.deleteConfig(req.params.id as string);
    res.json({ message: "Config deleted" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/alerts/history", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const severity = req.query.severity as string;
    const history = await alerts.getAlertHistory(limit, offset, severity);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/observability/alerts/:id/resolve", requireAdmin, async (req: AuthRequest, res) => {
  try {
    await alerts.resolveAlert(req.params.id as string);
    res.json({ message: "Alert resolved" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
//  AUDIT LOGS
// ─────────────────────────────────────────────

router.get("/observability/admin/audit-logs", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const resourceType = req.query.resourceType as string;
    const action = req.query.action as string;
    const logs = await audit.getAuditLogs(limit, offset, resourceType, action);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/observability/admin/audit-summary", requireAdmin, async (_req, res) => {
  try {
    const summary = await audit.getAuditSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
//  DEVELOPER DASHBOARD
// ─────────────────────────────────────────────

router.get("/observability/admin/dashboard", requireAdmin, async (_req, res) => {
  try {
    const [analyticsStats, feedbackSummary, qualityMetrics, providerComparison] = await Promise.all([
      analytics.getAggregatedStats(),
      feedback.getFeedbackSummary(),
      quality.getDashboardMetrics(),
      providers.getProviderComparison(),
    ]);

    // Recent consultations count (24h)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentConsultations] = await db.select({ count: count() })
      .from(consultationAnalyticsTable)
      .where(gte(consultationAnalyticsTable.createdAt, last24h));

    // Error rate
    const [totalCallsRes] = await db.select({ value: count() }).from(providerCallLogsTable);
    const [failedCallsRes] = await db.select({ value: count() }).from(providerCallLogsTable).where(eq(providerCallLogsTable.success, false));

    res.json({
      activeUsers24h: 0,
      dailyConsultations: Number(recentConsultations.count),
      totalConsultations: analyticsStats.totalConsultations,
      avgTokensUsed: analyticsStats.avgTokensUsed,
      avgLatencyMs: analyticsStats.avgLatencyMs,
      totalSafetyInterventions: analyticsStats.totalSafetyInterventions,
      avgConfidenceScore: analyticsStats.avgConfidenceScore,
      avgQualityScore: analyticsStats.avgQualityScore,
      qualityMetrics: qualityMetrics.current,
      qualityTrend: qualityMetrics.trend,
      feedback: feedbackSummary,
      providerComparison,
      errorRate: Number(totalCallsRes.value) > 0
        ? ((Number(failedCallsRes.value) / Number(totalCallsRes.value)) * 100).toFixed(2)
        : "0",
      riskDistribution: analyticsStats.riskDistribution,
      recommendationDistribution: analyticsStats.recommendationDistribution,
      providerDistribution: analyticsStats.providerDistribution,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
