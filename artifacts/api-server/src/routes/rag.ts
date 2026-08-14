import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { getRagEngine } from "../lib/rag/ragEngine";
import { IngestionPipeline } from "../lib/rag/ingestion/pipeline";
import { createEmbedder } from "../lib/rag/embeddings/embedder";
import { CitationEngine } from "../lib/rag/retrieval/citationEngine";
import { db, retrievalLogsTable, citationRecordsTable, knowledgeSourcesTable, medicalDocumentsTable, documentChunksTable } from "@workspace/db";
import { eq, desc, and, sql, count } from "drizzle-orm";

const router: IRouter = Router();

// ─── Search / Query ───

router.post("/rag/query", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const { query, pipelineStage, topK } = req.body;

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query text is required" });
    return;
  }

  try {
    const engine = getRagEngine();
    const response = await engine.query({
      text: query,
      userId,
      pipelineStage: pipelineStage ?? "general",
      topK: topK ?? 10,
    });
    res.json(response);
  } catch (err) {
    (req as any).log?.error?.({ err }, "RAG query failed");
    res.status(500).json({ error: "Failed to process RAG query" });
  }
});

// ─── Retrieve evidence for a specific pipeline stage ───

router.post("/rag/retrieve", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const { query, pipelineStage } = req.body;

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Query text is required" });
    return;
  }

  try {
    const engine = getRagEngine();
    const { evidenceBlock, citations } = await engine.formatEvidenceForPrompt({
      text: query,
      userId,
      pipelineStage: pipelineStage ?? "general",
    });
    res.json({ evidenceBlock, citations });
  } catch (err) {
    (req as any).log?.error?.({ err }, "RAG retrieve failed");
    res.status(500).json({ error: "Failed to retrieve evidence" });
  }
});

// ─── Get retrieval logs ───

router.get("/rag/logs", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const stage = req.query.stage as string | undefined;

  try {
    const conditions = [eq(retrievalLogsTable.userId, userId)];
    if (stage) conditions.push(eq(retrievalLogsTable.pipelineStage, stage));

    const logs = await db
      .select()
      .from(retrievalLogsTable)
      .where(and(...conditions))
      .orderBy(desc(retrievalLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ value: count() })
      .from(retrievalLogsTable)
      .where(and(...conditions));

    res.json({
      logs,
      total: Number(countResult?.value ?? 0),
      limit,
      offset,
    });
  } catch (err) {
    (req as any).log?.error?.({ err }, "Failed to fetch RAG logs");
    res.status(500).json({ error: "Failed to fetch retrieval logs" });
  }
});

// ─── Get citation history ───

router.get("/rag/citations", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  try {
    const citations = await db
      .select()
      .from(citationRecordsTable)
      .where(eq(citationRecordsTable.userId, userId))
      .orderBy(desc(citationRecordsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ value: count() })
      .from(citationRecordsTable)
      .where(eq(citationRecordsTable.userId, userId));

    res.json({
      citations,
      total: Number(countResult?.value ?? 0),
      limit,
      offset,
    });
  } catch (err) {
    (req as any).log?.error?.({ err }, "Failed to fetch citations");
    res.status(500).json({ error: "Failed to fetch citation history" });
  }
});

// ─── Search medical knowledge index ───

router.get("/rag/search", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const q = req.query.q as string;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  if (!q || typeof q !== "string") {
    res.status(400).json({ error: "Search query 'q' is required" });
    return;
  }

  try {
    const engine = getRagEngine();
    const response = await engine.query({
      text: q,
      userId,
      pipelineStage: "general",
      topK: limit,
    });

    res.json({
      hasEvidence: response.hasEvidence,
      totalResults: response.citations.length,
      summary: response.summary,
      noEvidenceMessage: response.noEvidenceMessage,
      groups: response.evidenceGroups,
      latencyMs: response.latencyMs,
    });
  } catch (err) {
    (req as any).log?.error?.({ err }, "RAG search failed");
    res.status(500).json({ error: "Search failed" });
  }
});

export default router;
