import { db, documentChunksTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { VectorStore, EmbeddingProvider } from "../types";
import { HybridSearchResult, VectorSearchQuery } from "../types";

export class HybridSearchEngine {
  private vectorStore: VectorStore;
  private embedder: EmbeddingProvider;

  constructor(vectorStore: VectorStore, embedder: EmbeddingProvider) {
    this.vectorStore = vectorStore;
    this.embedder = embedder;
  }

  async search(params: {
    query: string;
    topK?: number;
    semanticWeight?: number;
    keywordWeight?: number;
    minScore?: number;
    filters?: VectorSearchQuery["filters"];
  }): Promise<HybridSearchResult[]> {
    const topK = params.topK ?? 10;
    const semanticWeight = params.semanticWeight ?? 0.7;
    const keywordWeight = params.keywordWeight ?? 0.3;
    const minScore = params.minScore ?? 0.3;

    // Run semantic and keyword searches in parallel
    // Both now accept metadata filters for targeted retrieval
    const [semanticResults, keywordResults] = await Promise.all([
      this.semanticSearch(params.query, topK * 2, params.filters),
      this.keywordSearch(params.query, topK * 2, params.filters),
    ]);

    // Merge results
    const merged = new Map<string, HybridSearchResult>();

    for (const r of semanticResults) {
      merged.set(r.chunkId, {
        chunkId: r.chunkId,
        documentId: r.documentId,
        sourceId: r.sourceId,
        content: r.content,
        contentPreview: r.contentPreview,
        section: r.section,
        heading: r.heading,
        semanticScore: r.score,
        keywordScore: 0,
        combinedScore: r.score * semanticWeight,
        metadata: r.metadata,
      });
    }

    for (const r of keywordResults) {
      const existing = merged.get(r.chunkId);
      if (existing) {
        existing.keywordScore = r.score;
        existing.combinedScore = (existing.semanticScore * semanticWeight) + (r.score * keywordWeight);
      } else {
        merged.set(r.chunkId, {
          chunkId: r.chunkId,
          documentId: r.documentId,
          sourceId: r.sourceId,
          content: r.content,
          contentPreview: r.contentPreview,
          section: r.section,
          heading: r.heading,
          semanticScore: 0,
          keywordScore: r.score,
          combinedScore: r.score * keywordWeight,
          metadata: r.metadata,
        });
      }
    }

    return Array.from(merged.values())
      .filter((r) => r.combinedScore >= minScore)
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, topK);
  }

  private async semanticSearch(
    query: string,
    topK: number,
    filters?: VectorSearchQuery["filters"],
  ): Promise<Array<{ chunkId: string; documentId: string; sourceId?: string; content: string; contentPreview?: string; section?: string; heading?: string; score: number; metadata?: Record<string, unknown> }>> {
    const embedding = await this.embedder.generateEmbedding(query);
    return this.vectorStore.search({
      embedding,
      topK,
      minScore: 0,
      filters,
    });
  }

  private async keywordSearch(
    query: string,
    topK: number,
    filters?: VectorSearchQuery["filters"],
  ): Promise<Array<{ chunkId: string; documentId: string; sourceId?: string; content: string; contentPreview?: string; section?: string; heading?: string; score: number; metadata?: Record<string, unknown> }>> {
    const terms = query
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .map((t) => t.toLowerCase());

    if (terms.length === 0) return [];

    // Build metadata filter conditions for SQL WHERE clause
    const metadataConditions: string[] = [];
    if (filters && filters.length > 0) {
      for (const filter of filters) {
        if (filter.operator === "eq" && typeof filter.value === "string") {
          // Support filtering by metadata fields stored as JSONB
          metadataConditions.push(
            `dc.metadata->>'${filter.field}' = '${filter.value}'`
          );
        } else if (filter.operator === "in" && Array.isArray(filter.value)) {
          const vals = filter.value.map((v) => `'${v}'`).join(",");
          metadataConditions.push(
            `dc.metadata->>'${filter.field}' IN (${vals})`
          );
        }
      }
    }

    const metadataWhere = metadataConditions.length > 0
      ? ` AND ${metadataConditions.join(" AND ")}`
      : "";

    try {
      const tsquery = terms
        .map((t) => `${t}:*`)
        .join(" & ");

      const results = await db.execute(sql`
        SELECT
          dc.id,
          dc.document_id,
          dc.source_id,
          dc.content,
          dc.content_preview,
          dc.section,
          dc.heading,
          dc.metadata,
          ts_rank(to_tsvector('english', dc.content), to_tsquery('english', ${tsquery})) as rank
        FROM document_chunks dc
        WHERE to_tsvector('english', dc.content) @@ to_tsquery('english', ${tsquery})
        ${sql.raw(metadataWhere)}
        ORDER BY rank DESC
        LIMIT ${topK}
      `);

      const rows = results.rows ?? results ?? [];
      return (rows as any[]).map((r) => ({
        chunkId: String(r.id),
        documentId: String(r.document_id),
        sourceId: r.source_id ? String(r.source_id) : undefined,
        content: String(r.content),
        contentPreview: r.content_preview ? String(r.content_preview) : undefined,
        section: r.section ? String(r.section) : undefined,
        heading: r.heading ? String(r.heading) : undefined,
        score: Math.min(Number(r.rank ?? 0) / 10, 1),
        metadata: r.metadata ? (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) : undefined,
      }));
    } catch {
      // Fallback: simple ILIKE search
      return this.simpleKeywordSearch(query, topK);
    }
  }

  private async simpleKeywordSearch(
    query: string,
    topK: number,
  ): Promise<Array<{ chunkId: string; documentId: string; sourceId?: string; content: string; contentPreview?: string; section?: string; heading?: string; score: number; metadata?: Record<string, unknown> }>> {
    const terms = query
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (terms.length === 0) return [];

    const conditions = terms.map((t) => sql`dc.content ILIKE ${`%${t}%`}`);
    const whereClause = sql`WHERE ${sql.join(conditions, sql` OR `)}`;

    try {
      const results = await db.execute(sql`
        SELECT
          dc.id,
          dc.document_id,
          dc.source_id,
          dc.content,
          dc.content_preview,
          dc.section,
          dc.heading,
          dc.metadata
        FROM document_chunks dc
        ${whereClause}
        LIMIT ${topK}
      `);

      const rows = results.rows ?? results ?? [];
      return (rows as any[]).map((r) => ({
        chunkId: String(r.id),
        documentId: String(r.document_id),
        sourceId: r.source_id ? String(r.source_id) : undefined,
        content: String(r.content),
        contentPreview: r.content_preview ? String(r.content_preview) : undefined,
        section: r.section ? String(r.section) : undefined,
        heading: r.heading ? String(r.heading) : undefined,
        score: 0.5,
        metadata: r.metadata ? (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) : undefined,
      }));
    } catch {
      return [];
    }
  }
}
