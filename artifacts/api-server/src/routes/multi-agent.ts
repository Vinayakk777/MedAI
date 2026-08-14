import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { Orchestrator } from "../lib/multi-agent/orchestrator";
import { getAllAgents } from "../lib/multi-agent/registry";
import { getPipeline } from "../lib/multi-agent/pipelineDefinition";
import { ExecutionLogger } from "../lib/multi-agent/executionLogger";
import { getAvailableProviders } from "../lib/multi-agent/providers/llmProvider";
import { db, agentPipelineRunsTable } from "@workspace/db";
import { eq, desc, count as drizzleCount } from "drizzle-orm";

const router: IRouter = Router();
const orchestrator = new Orchestrator();
const logger = new ExecutionLogger();

// ─── Run full pipeline ───

router.post("/multi-agent/run", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const { message, history, conversationId, patientData, pipelineName } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  try {
    const pipeline = getPipeline(pipelineName ?? "standard");
    const result = await orchestrator.runPipeline({
      pipeline,
      message,
      history: history ?? [],
      userId,
      conversationId,
      patientData,
    });
    res.json(result);
  } catch (err) {
    (req as any).log?.error?.({ err }, "Multi-agent pipeline failed");
    res.status(500).json({ error: "Pipeline execution failed: " + String(err) });
  }
});

// ─── List runs ───

router.get("/multi-agent/runs", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  try {
    const result = await logger.getRecentRuns(userId, limit, offset);
    res.json(result);
  } catch (err) {
    (req as any).log?.error?.({ err }, "Failed to fetch runs");
    res.status(500).json({ error: "Failed to fetch runs" });
  }
});

// ─── Get run details ───

router.get("/multi-agent/runs/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);

  try {
    const result = await logger.getRun(id);
    if (!result) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    if (result.run.userId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    res.json(result);
  } catch (err) {
    (req as any).log?.error?.({ err }, "Failed to fetch run");
    res.status(500).json({ error: "Failed to fetch run" });
  }
});

// ─── List registered agents ───

router.get("/multi-agent/agents", requireAuth, async (_req, res) => {
  const agents = getAllAgents();
  res.json(agents.map((a) => ({
    name: a.name,
    description: a.description,
    version: a.version,
    dependsOn: a.dependsOn,
    maxRetries: a.maxRetries,
    timeoutMs: a.timeoutMs,
  })));
});

// ─── Performance metrics ───

router.get("/multi-agent/performance", requireAuth, async (_req, res) => {
  try {
    const metrics = await logger.getPerformanceMetrics();
    res.json(metrics);
  } catch (err) {
    (_req as any).log?.error?.({ err }, "Failed to fetch performance metrics");
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// ─── Available LLM providers ───

router.get("/multi-agent/providers", requireAuth, async (_req, res) => {
  const providers = getAvailableProviders();
  res.json(providers.map((p) => ({
    name: p.name,
    models: p.models,
    available: p.isAvailable(),
  })));
});

// ─── Pipeline definition ───

router.get("/multi-agent/pipeline", requireAuth, async (req, res) => {
  const pipeline = getPipeline((req.query.name as string) ?? "standard");
  res.json(pipeline);
});

export default router;
