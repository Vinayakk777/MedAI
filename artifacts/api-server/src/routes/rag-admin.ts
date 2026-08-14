import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { db, knowledgeSourcesTable, medicalDocumentsTable, documentChunksTable, retrievalLogsTable, citationRecordsTable } from "@workspace/db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import { createEmbedder } from "../lib/rag/embeddings/embedder";
import { IngestionPipeline } from "../lib/rag/ingestion/pipeline";
import { getRagEngine, resetRagEngine } from "../lib/rag/ragEngine";
import { getAllProviders } from "../lib/rag/providers/knowledgeSourceProvider";
import { ragCache } from "../lib/rag/cache";
import { getAllChunkers } from "../lib/rag/ingestion/chunkingStrategy";

const router: IRouter = Router();

// ─── Health check ───

router.get("/rag-admin/health", requireAuth, async (_req, res) => {
  try {
    const engine = getRagEngine();
    await engine.ensureSetup();
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "error", error: String(err) });
  }
});

// ─── Stats ───

router.get("/rag-admin/stats", requireAuth, async (_req, res) => {
  try {
    const pipeline = new IngestionPipeline(createEmbedder());
    const docStats = await pipeline.getDocumentStats();

    const [retrievalCount] = await db
      .select({ value: count() })
      .from(retrievalLogsTable);

    const [citationCount] = await db
      .select({ value: count() })
      .from(citationRecordsTable);

    const [uniqueStages] = await db
      .select({ stages: sql`array_agg(DISTINCT pipeline_stage)` })
      .from(retrievalLogsTable);

    const cacheStats = ragCache.stats();

    res.json({
      documents: docStats,
      retrievalLogs: Number(retrievalCount?.value ?? 0),
      citations: Number(citationCount?.value ?? 0),
      stages: (uniqueStages as any)?.stages ?? [],
      cache: cacheStats,
    });
  } catch (err) {
    (_req as any).log?.error?.({ err }, "Failed to fetch RAG admin stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── Knowledge Sources ───

router.get("/rag-admin/sources", requireAuth, async (_req, res) => {
  try {
    const sources = await db
      .select()
      .from(knowledgeSourcesTable)
      .orderBy(desc(knowledgeSourcesTable.createdAt));
    res.json(sources);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sources" });
  }
});

router.post("/rag-admin/sources", requireAuth, async (req, res) => {
  const { slug, name, organization, description, website, sourceType } = req.body;
  if (!slug || !name || !organization) {
    res.status(400).json({ error: "slug, name, and organization are required" });
    return;
  }
  try {
    const [source] = await db
      .insert(knowledgeSourcesTable)
      .values({ slug, name, organization, description, website, sourceType })
      .returning();
    res.json(source);
  } catch (err) {
    res.status(500).json({ error: "Failed to create source" });
  }
});

router.patch("/rag-admin/sources/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const updates: Record<string, unknown> = {};
  for (const key of ["slug", "name", "organization", "description", "website", "isActive", "sourceType"]) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  try {
    const [source] = await db
      .update(knowledgeSourcesTable)
      .set(updates)
      .where(eq(knowledgeSourcesTable.id, id))
      .returning();
    res.json(source);
  } catch (err) {
    res.status(500).json({ error: "Failed to update source" });
  }
});

// ─── Documents ───

router.get("/rag-admin/documents", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  try {
    const docs = await db
      .select()
      .from(medicalDocumentsTable)
      .where(eq(medicalDocumentsTable.isArchived, false))
      .orderBy(desc(medicalDocumentsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ value: count() })
      .from(medicalDocumentsTable)
      .where(eq(medicalDocumentsTable.isArchived, false));

    res.json({ documents: docs, total: Number(countResult?.value ?? 0) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// ─── Ingest a document ───

router.post("/rag-admin/ingest", requireAuth, async (req, res) => {
  const { title, organization, sourceId, content, category, documentType, publicationDate, version, tags, chunkerName, maxChunkSize, chunkOverlap } = req.body;

  if (!title || !organization || !content) {
    res.status(400).json({ error: "title, organization, and content are required" });
    return;
  }

  try {
    const embedder = createEmbedder();
    const pipeline = new IngestionPipeline(embedder);
    const result = await pipeline.ingestDocument({
      title,
      organization,
      sourceId,
      content,
      category,
      documentType: documentType ?? "text",
      publicationDate: publicationDate ? new Date(publicationDate) : undefined,
      version,
      tags,
      chunkerName,
      chunkOptions: { maxChunkSize, chunkOverlap },
    });

    // Clear relevant cache entries
    ragCache.invalidate();

    res.json(result);
  } catch (err) {
    (req as any).log?.error?.({ err }, "Document ingestion failed");
    res.status(500).json({ error: "Ingestion failed: " + String(err) });
  }
});

// ─── Re-index ───

router.post("/rag-admin/reindex/:documentId", requireAuth, async (req, res) => {
  const documentId = String(req.params.documentId);
  try {
    const embedder = createEmbedder();
    const pipeline = new IngestionPipeline(embedder);
    const result = await pipeline.reIndexDocument(documentId);
    if (!result) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    ragCache.invalidate();
    res.json(result);
  } catch (err) {
    (req as any).log?.error?.({ err }, "Re-index failed");
    res.status(500).json({ error: "Re-index failed" });
  }
});

router.post("/rag-admin/reindex-all", requireAuth, async (req, res) => {
  try {
    const embedder = createEmbedder();
    const pipeline = new IngestionPipeline(embedder);
    const results = await pipeline.reIndexAll();
    ragCache.invalidate();
    res.json({ reindexed: results.length, results });
  } catch (err) {
    (req as any).log?.error?.({ err }, "Re-index all failed");
    res.status(500).json({ error: "Re-index all failed" });
  }
});

// ─── Delete document ───

router.delete("/rag-admin/documents/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const embedder = createEmbedder();
    const pipeline = new IngestionPipeline(embedder);
    await pipeline.deleteDocument(id);
    ragCache.invalidate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// ─── Provider info ───

router.get("/rag-admin/providers", requireAuth, async (_req, res) => {
  const providers = getAllProviders();
  res.json(providers.map((p) => ({
    slug: p.slug,
    name: p.name,
    organization: p.organization,
    description: p.description,
  })));
});

// ─── Chunkers info ───

router.get("/rag-admin/chunkers", requireAuth, async (_req, res) => {
  const chunkers = getAllChunkers();
  res.json(chunkers.map((c) => ({ name: c.name })));
});

// ─── Clear cache ───

router.post("/rag-admin/clear-cache", requireAuth, async (_req, res) => {
  ragCache.invalidate();
  res.json({ success: true });
});

// ─── Refresh embeddings for all chunks ───

router.post("/rag-admin/refresh-embeddings", requireAuth, async (req, res) => {
  try {
    const embedder = createEmbedder();
    const pipeline = new IngestionPipeline(embedder);
    const results = await pipeline.reIndexAll();
    ragCache.invalidate();
    res.json({ refreshed: results.length, results });
  } catch (err) {
    (req as any).log?.error?.({ err }, "Embedding refresh failed");
    res.status(500).json({ error: "Embedding refresh failed" });
  }
});

// ─── Retrieval quality stats ───

router.get("/rag-admin/quality", requireAuth, async (_req, res) => {
  try {
    const [totalRetrievals] = await db
      .select({ value: count() })
      .from(retrievalLogsTable);

    const [contextUsed] = await db
      .select({ value: count() })
      .from(retrievalLogsTable)
      .where(eq(retrievalLogsTable.contextUsed, true));

    const [fallbacks] = await db
      .select({ value: count() })
      .from(retrievalLogsTable)
      .where(eq(retrievalLogsTable.wasFallback, true));

    const [avgLatency] = await db
      .select({ avg: sql`AVG(latency_ms)` })
      .from(retrievalLogsTable);

    const [last24h] = await db
      .select({ value: count() })
      .from(retrievalLogsTable)
      .where(sql`created_at > NOW() - INTERVAL '24 hours'`);

    const total = Number(totalRetrievals?.value ?? 0);

    res.json({
      totalRetrievals: total,
      contextUsedRate: total > 0 ? Number(contextUsed?.value ?? 0) / total : 0,
      fallbackRate: total > 0 ? Number(fallbacks?.value ?? 0) / total : 0,
      avgLatencyMs: Math.round(Number(avgLatency?.avg ?? 0)),
      retrievalsLast24h: Number(last24h?.value ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch quality stats" });
  }
});

export default router;
