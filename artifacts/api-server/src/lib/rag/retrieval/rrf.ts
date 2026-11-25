import type { HybridSearchResult } from "../types";

/**
 * Reciprocal Rank Fusion (RRF).
 *
 * RRF combines ranked lists without needing comparable scores:
 *
 *   score(d) = Σ weight_i / (k + rank_i(d))
 *
 * where `rank_i` is the 1-based position in list `i` and `k` is a smoothing
 * constant (60 is the commonly used default). Only rank order matters, which is
 * why RRF is a good fit for fusing pgvector cosine results with PostgreSQL
 * `ts_rank` results: the two scores live on different scales.
 *
 * The returned `combinedScore` is normalized to (0, 1] so downstream consumers
 * that expect a relevance-like score (confidence calculation, re-rankers) keep
 * working. The raw RRF value is preserved in `rrfScore`.
 */

export interface RrfOptions {
  /** Smoothing constant. Higher values flatten the contribution of top ranks. */
  k?: number;
  semanticWeight?: number;
  keywordWeight?: number;
}

interface RrfEntry {
  result: HybridSearchResult;
  rrfScore: number;
  semanticRank?: number;
  keywordRank?: number;
}

function mergeFields(
  target: HybridSearchResult,
  incoming: HybridSearchResult,
): HybridSearchResult {
  return {
    chunkId: target.chunkId,
    documentId: target.documentId || incoming.documentId,
    sourceId: target.sourceId ?? incoming.sourceId,
    content: target.content || incoming.content,
    contentPreview: target.contentPreview ?? incoming.contentPreview,
    section: target.section ?? incoming.section,
    heading: target.heading ?? incoming.heading,
    semanticScore: Math.max(target.semanticScore, incoming.semanticScore),
    keywordScore: Math.max(target.keywordScore, incoming.keywordScore),
    combinedScore: target.combinedScore,
    metadata: target.metadata ?? incoming.metadata,
  };
}

/**
 * Fuse semantic and keyword ranked lists with RRF.
 *
 * Duplicate chunk IDs are merged once. Semantic metadata is preferred, with
 * missing fields filled from the keyword result. Ordering is deterministic:
 * RRF score descending, then best individual rank, then chunk ID.
 */
export function fuseWithReciprocalRankFusion(
  semanticResults: HybridSearchResult[],
  keywordResults: HybridSearchResult[],
  options: RrfOptions = {},
): HybridSearchResult[] {
  const k = options.k ?? 60;
  if (!Number.isFinite(k) || k < 0) {
    throw new Error(`Invalid RRF k: ${k}`);
  }

  const semanticWeight = options.semanticWeight ?? 1;
  const keywordWeight = options.keywordWeight ?? 1;
  if (semanticWeight < 0 || keywordWeight < 0) {
    throw new Error("RRF weights must be non-negative");
  }

  const entries = new Map<string, RrfEntry>();

  const addList = (
    results: HybridSearchResult[],
    weight: number,
    kind: "semantic" | "keyword",
  ) => {
    results.forEach((result, index) => {
      if (weight === 0) return;
      const rank = index + 1;
      const contribution = weight / (k + rank);
      const existing = entries.get(result.chunkId);

      if (existing) {
        existing.result = mergeFields(existing.result, result);
        existing.rrfScore += contribution;
        if (kind === "semantic") {
          existing.semanticRank ??= rank;
        } else {
          existing.keywordRank ??= rank;
        }
      } else {
        entries.set(result.chunkId, {
          result: { ...result },
          rrfScore: contribution,
          semanticRank: kind === "semantic" ? rank : undefined,
          keywordRank: kind === "keyword" ? rank : undefined,
        });
      }
    });
  };

  addList(semanticResults, semanticWeight, "semantic");
  addList(keywordResults, keywordWeight, "keyword");

  if (entries.size === 0) return [];

  // Normalize against the best possible score for the lists that actually
  // contributed. This keeps `combinedScore` in (0, 1] for downstream
  // confidence calculations while preserving RRF ordering.
  const maxPossible =
    (semanticResults.length > 0 ? semanticWeight : 0) / (k + 1) +
    (keywordResults.length > 0 ? keywordWeight : 0) / (k + 1);
  const denominator = maxPossible > 0 ? maxPossible : 1;

  return [...entries.values()]
    .sort((a, b) => {
      const byScore = b.rrfScore - a.rrfScore;
      if (byScore !== 0) return byScore;

      const aBest = Math.min(
        a.semanticRank ?? Number.POSITIVE_INFINITY,
        a.keywordRank ?? Number.POSITIVE_INFINITY,
      );
      const bBest = Math.min(
        b.semanticRank ?? Number.POSITIVE_INFINITY,
        b.keywordRank ?? Number.POSITIVE_INFINITY,
      );
      if (aBest !== bBest) return aBest - bBest;

      return a.result.chunkId.localeCompare(b.result.chunkId);
    })
    .map((entry) => ({
      ...entry.result,
      combinedScore: entry.rrfScore / denominator,
      rrfScore: entry.rrfScore,
      semanticRank: entry.semanticRank,
      keywordRank: entry.keywordRank,
    }));
}
