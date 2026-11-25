/**
 * Explicit retrieval configuration.
 *
 * The production default is weighted score fusion over pgvector semantic
 * results and PostgreSQL full-text keyword results (0.7 semantic / 0.3
 * keyword), which is the behavior that shipped before RRF was evaluated.
 *
 * RRF is available as an explicit opt-in. On the golden fixture it showed no
 * measured gain on Recall@K, MRR, delivered citation precision, citation
 * coverage or route accuracy, so it is not the default.
 */

export type RetrievalFusion = "rrf" | "weighted";

export interface RetrievalConfig {
  /** Fusion strategy for the two ranked lists. */
  fusion: RetrievalFusion;

  /**
   * Each branch retrieves `finalTopK * candidateMultiplier` candidates before
   * fusion. This gives the re-ranker a wider pool without changing the final
   * result count.
   */
  candidateMultiplier: number;

  /** RRF smoothing constant. Only used when `fusion === "rrf"`. */
  rrfK: number;

  /** Weight applied to the semantic list during fusion. */
  semanticWeight: number;

  /** Weight applied to the keyword list during fusion. */
  keywordWeight: number;

  /**
   * Minimum combined score for weighted fusion. Ignored by RRF because RRF
   * scores are not comparable to cosine similarity.
   */
  minCombinedScore: number;

  /** Per-branch score floor applied before fusion (both modes). */
  minSemanticScore: number;
  minKeywordScore: number;

  /**
   * The RAG engine asks hybrid search for `topK * finalTopKMultiplier`
   * candidates so the re-ranker has room to reorder.
   */
  finalTopKMultiplier: number;
}

/**
 * Weighted score fusion with a combined-score floor and no per-branch floors.
 * This is the production default and the evaluation baseline.
 */
export const WEIGHTED_BASELINE_CONFIG: RetrievalConfig = {
  fusion: "weighted",
  candidateMultiplier: 2,
  rrfK: 60,
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  minCombinedScore: 0.25,
  minSemanticScore: 0,
  minKeywordScore: 0,
  finalTopKMultiplier: 3,
};

/** Production default: the pre-RRF weighted fusion behavior. */
export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  ...WEIGHTED_BASELINE_CONFIG,
};

/**
 * Opt-in Reciprocal Rank Fusion over the same two ranked lists. Select it with
 * `new RagEngine({ retrievalConfig: { fusion: "rrf" } })` or by passing
 * `fusion: "rrf"` to `HybridSearchEngine.search`.
 */
export const RRF_CONFIG: RetrievalConfig = {
  fusion: "rrf",
  candidateMultiplier: 2,
  rrfK: 60,
  semanticWeight: 1,
  keywordWeight: 1,
  minCombinedScore: 0.25,
  minSemanticScore: 0.25,
  minKeywordScore: 0,
  finalTopKMultiplier: 3,
};

/**
 * Resolve user overrides against the production defaults and clamp values to
 * safe ranges so a bad configuration cannot silently disable retrieval.
 */
export function resolveRetrievalConfig(
  overrides?: Partial<RetrievalConfig>,
): RetrievalConfig {
  const config: RetrievalConfig = {
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...overrides,
  };

  // Invalid values fall back to the production default rather than silently
  // opting into the non-default fusion mode.
  config.fusion = config.fusion === "rrf" ? "rrf" : "weighted";
  config.candidateMultiplier = clamp(config.candidateMultiplier, 1, 20);
  config.rrfK = clamp(config.rrfK, 1, 1000);
  config.semanticWeight = clamp(config.semanticWeight, 0, 100);
  config.keywordWeight = clamp(config.keywordWeight, 0, 100);
  config.minCombinedScore = clamp(config.minCombinedScore, 0, 1);
  config.minSemanticScore = clamp(config.minSemanticScore, 0, 1);
  config.minKeywordScore = clamp(config.minKeywordScore, 0, 1);
  config.finalTopKMultiplier = clamp(config.finalTopKMultiplier, 1, 20);

  return config;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
