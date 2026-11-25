import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type {
  EmbeddingProvider,
  HybridSearchResult,
  VectorSearchQuery,
  VectorStore,
} from "../types";
import { fuseWithReciprocalRankFusion } from "./rrf";
import {
  DEFAULT_RETRIEVAL_CONFIG,
  type RetrievalFusion,
} from "./retrievalConfig";

interface BranchResult {
  chunkId: string;
  documentId: string;
  sourceId?: string;
  content: string;
  contentPreview?: string;
  section?: string;
  heading?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface HybridSearchParams {
  query: string;
  topK?: number;
  filters?: VectorSearchQuery["filters"];
  fusion?: RetrievalFusion;
  candidateMultiplier?: number;
  rrfK?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  minCombinedScore?: number;
  minSemanticScore?: number;
  minKeywordScore?: number;
}

/**
 * Hybrid retrieval over pgvector (semantic) and PostgreSQL full-text search
 * (keyword).
 *
 * The branches are isolated with `Promise.allSettled`, so a failing or empty
 * branch does not take down the other. When both contribute, the ranked lists
 * are fused with weighted score fusion by default, matching the production
 * behavior that shipped before RRF was evaluated. Reciprocal Rank Fusion is
 * available via `fusion: "rrf"`.
 * If both branches are empty and one actually failed, the failure propagates so
 * `RagEngine` can use its existing retry and no-evidence fallback.
 */
export class HybridSearchEngine {
  private vectorStore: VectorStore;
  private embedder: EmbeddingProvider;

  constructor(vectorStore: VectorStore, embedder: EmbeddingProvider) {
    this.vectorStore = vectorStore;
    this.embedder = embedder;
  }

  async search(params: HybridSearchParams): Promise<HybridSearchResult[]> {
    const topK = Math.max(1, params.topK ?? 10);
    const fusion = params.fusion ?? DEFAULT_RETRIEVAL_CONFIG.fusion;
    const candidateMultiplier =
      params.candidateMultiplier ?? DEFAULT_RETRIEVAL_CONFIG.candidateMultiplier;
    const candidateTopK = Math.max(topK, Math.ceil(topK * candidateMultiplier));
    const minSemanticScore = params.minSemanticScore ?? 0;
    const minKeywordScore = params.minKeywordScore ?? 0;

    // Run both branches in parallel. `allSettled` ensures one failing branch
    // cannot take down the other.
    const [semanticOutcome, keywordOutcome] = await Promise.allSettled([
      this.semanticSearch(params.query, candidateTopK, params.filters),
      this.keywordSearch(params.query, candidateTopK, params.filters),
    ]);

    const semanticResults =
      semanticOutcome.status === "fulfilled" ? semanticOutcome.value : [];
    const keywordResults =
      keywordOutcome.status === "fulfilled" ? keywordOutcome.value : [];

    const filteredSemantic = semanticResults.filter(
      (result) => result.score >= minSemanticScore,
    );
    const filteredKeyword = keywordResults.filter(
      (result) => result.score >= minKeywordScore,
    );

    if (filteredSemantic.length === 0 && filteredKeyword.length === 0) {
      // Preserve the engine's existing failure semantics: if a branch actually
      // threw and the surviving branch has nothing, let the caller retry/fall
      // back rather than silently reporting "no evidence".
      if (semanticOutcome.status === "rejected") {
        throw semanticOutcome.reason;
      }
      if (keywordOutcome.status === "rejected") {
        throw keywordOutcome.reason;
      }
      return [];
    }

    const semanticHybrid = filteredSemantic.map(toSemanticHybrid);
    const keywordHybrid = filteredKeyword.map(toKeywordHybrid);

    if (fusion === "rrf") {
      // Single-branch degradation: keep the surviving branch's calibrated
      // score instead of inventing an RRF score for a one-item list.
      if (keywordHybrid.length === 0) {
        return semanticHybrid
          .sort(compareSemantic)
          .slice(0, topK);
      }
      if (semanticHybrid.length === 0) {
        return keywordHybrid.sort(compareKeyword).slice(0, topK);
      }

      return fuseWithReciprocalRankFusion(semanticHybrid, keywordHybrid, {
        k: params.rrfK ?? DEFAULT_RETRIEVAL_CONFIG.rrfK,
        semanticWeight:
          params.semanticWeight ?? DEFAULT_RETRIEVAL_CONFIG.semanticWeight,
        keywordWeight:
          params.keywordWeight ?? DEFAULT_RETRIEVAL_CONFIG.keywordWeight,
      }).slice(0, topK);
    }

    return this.fuseWeighted(semanticHybrid, keywordHybrid, {
      semanticWeight:
        params.semanticWeight ?? DEFAULT_RETRIEVAL_CONFIG.semanticWeight,
      keywordWeight:
        params.keywordWeight ?? DEFAULT_RETRIEVAL_CONFIG.keywordWeight,
      minCombinedScore:
        params.minCombinedScore ?? DEFAULT_RETRIEVAL_CONFIG.minCombinedScore,
      topK,
    });
  }

  /**
   * Weighted score fusion retained for the pre-RRF baseline. Duplicate chunk
   * IDs are merged once and ordered deterministically.
   */
  private fuseWeighted(
    semanticResults: HybridSearchResult[],
    keywordResults: HybridSearchResult[],
    options: {
      semanticWeight: number;
      keywordWeight: number;
      minCombinedScore: number;
      topK: number;
    },
  ): HybridSearchResult[] {
    const merged = new Map<string, HybridSearchResult>();

    for (const result of semanticResults) {
      merged.set(result.chunkId, { ...result });
    }

    for (const result of keywordResults) {
      const existing = merged.get(result.chunkId);
      if (existing) {
        existing.semanticScore = Math.max(
          existing.semanticScore,
          result.semanticScore,
        );
        existing.keywordScore = Math.max(
          existing.keywordScore,
          result.keywordScore,
        );
        existing.combinedScore =
          existing.semanticScore * options.semanticWeight +
          existing.keywordScore * options.keywordWeight;
        existing.sourceId ??= result.sourceId;
        existing.contentPreview ??= result.contentPreview;
        existing.section ??= result.section;
        existing.heading ??= result.heading;
        existing.metadata ??= result.metadata;
      } else {
        merged.set(result.chunkId, {
          ...result,
          combinedScore: result.keywordScore * options.keywordWeight,
        });
      }
    }

    return [...merged.values()]
      .filter((result) => result.combinedScore >= options.minCombinedScore)
      .sort(
        (a, b) =>
          b.combinedScore - a.combinedScore ||
          a.chunkId.localeCompare(b.chunkId),
      )
      .slice(0, options.topK);
  }

  private async semanticSearch(
    query: string,
    topK: number,
    filters?: VectorSearchQuery["filters"],
  ): Promise<BranchResult[]> {
    const embedding = await this.embedder.generateEmbedding(query);
    const results = await this.vectorStore.search({
      embedding,
      topK,
      minScore: 0,
      filters,
    });
    // Stores are expected to return ranked results, but sorting here makes the
    // RRF ranks deterministic even for a custom or fixture store.
    return [...results].sort(
      (a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId),
    );
  }

  private async keywordSearch(
    query: string,
    topK: number,
    filters?: VectorSearchQuery["filters"],
  ): Promise<BranchResult[]> {
    const terms = query
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .map((t) => t.toLowerCase());

    if (terms.length === 0) return [];

    try {
      const tsquery = terms.map((t) => `${t}:*`).join(" & ");
      const metadataWhere = this.buildMetadataWhere(filters);

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
        ${metadataWhere}
        ORDER BY rank DESC, dc.id ASC
        LIMIT ${topK}
      `);

      const rows = results.rows ?? results ?? [];
      return (rows as any[])
        .map((r) => ({
          chunkId: String(r.id),
          documentId: String(r.document_id),
          sourceId: r.source_id ? String(r.source_id) : undefined,
          content: String(r.content),
          contentPreview: r.content_preview ? String(r.content_preview) : undefined,
          section: r.section ? String(r.section) : undefined,
          heading: r.heading ? String(r.heading) : undefined,
          score: Math.min(Number(r.rank ?? 0) / 10, 1),
          metadata: r.metadata
            ? typeof r.metadata === "string"
              ? JSON.parse(r.metadata)
              : r.metadata
            : undefined,
        }))
        .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
    } catch {
      // Fallback: simple ILIKE search, still filtered and deterministic.
      return this.simpleKeywordSearch(query, topK, filters);
    }
  }

  private async simpleKeywordSearch(
    query: string,
    topK: number,
    filters?: VectorSearchQuery["filters"],
  ): Promise<BranchResult[]> {
    const terms = query.split(/\s+/).filter((t) => t.length > 2);
    if (terms.length === 0) return [];

    const contentConditions = terms.map(
      (term) => sql`dc.content ILIKE ${`%${term}%`}`,
    );
    const metadataWhere = this.buildMetadataWhere(filters);

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
        WHERE (${sql.join(contentConditions, sql` OR `)})${metadataWhere}
        ORDER BY dc.id ASC
        LIMIT ${topK}
      `);

      const rows = results.rows ?? results ?? [];
      return (rows as any[])
        .map((r) => ({
          chunkId: String(r.id),
          documentId: String(r.document_id),
          sourceId: r.source_id ? String(r.source_id) : undefined,
          content: String(r.content),
          contentPreview: r.content_preview ? String(r.content_preview) : undefined,
          section: r.section ? String(r.section) : undefined,
          heading: r.heading ? String(r.heading) : undefined,
          score: 0.5,
          metadata: r.metadata
            ? typeof r.metadata === "string"
              ? JSON.parse(r.metadata)
              : r.metadata
            : undefined,
        }))
        .sort((a, b) => a.chunkId.localeCompare(b.chunkId));
    } catch {
      return [];
    }
  }

  /**
   * Build metadata JSONB predicates from vector filters.
   *
   * Field names are restricted to identifier characters and values are bound
   * as SQL parameters, so filter input cannot alter the query shape.
   */
  private buildMetadataWhere(
    filters?: VectorSearchQuery["filters"],
  ): ReturnType<typeof sql> {
    if (!filters || filters.length === 0) return sql``;

    const conditions: Array<ReturnType<typeof sql>> = [];
    for (const filter of filters) {
      if (!/^[A-Za-z0-9_]+$/.test(filter.field)) continue;

      if (filter.operator === "eq") {
        conditions.push(
          sql`dc.metadata->>${filter.field} = ${String(filter.value)}`,
        );
      } else if (filter.operator === "in" && Array.isArray(filter.value)) {
        const values = filter.value.map((value) => String(value));
        if (values.length > 0) {
          conditions.push(
            sql`dc.metadata->>${filter.field} = ANY(${values})`,
          );
        }
      }
    }

    if (conditions.length === 0) return sql``;
    return sql` AND ${sql.join(conditions, sql` AND `)}`;
  }
}

function toSemanticHybrid(result: BranchResult): HybridSearchResult {
  const { score, ...rest } = result;
  return {
    ...rest,
    semanticScore: score,
    keywordScore: 0,
    combinedScore: score,
  };
}

function toKeywordHybrid(result: BranchResult): HybridSearchResult {
  const { score, ...rest } = result;
  return {
    ...rest,
    semanticScore: 0,
    keywordScore: score,
    combinedScore: score,
  };
}

function compareSemantic(a: HybridSearchResult, b: HybridSearchResult): number {
  return b.semanticScore - a.semanticScore || a.chunkId.localeCompare(b.chunkId);
}

function compareKeyword(a: HybridSearchResult, b: HybridSearchResult): number {
  return b.keywordScore - a.keywordScore || a.chunkId.localeCompare(b.chunkId);
}
