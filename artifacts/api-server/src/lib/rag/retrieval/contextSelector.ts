import { ReRankedResult } from "../types";

const MAX_TOKENS_ESTIMATE = 3000;
const CHARS_PER_TOKEN = 4;

export class ContextSelector {
  private maxTokens: number;
  private dedupThreshold: number;

  constructor(options?: { maxTokens?: number; dedupThreshold?: number }) {
    this.maxTokens = options?.maxTokens ?? MAX_TOKENS_ESTIMATE;
    this.dedupThreshold = options?.dedupThreshold ?? 0.85;
  }

  select(results: ReRankedResult[]): ReRankedResult[] {
    if (results.length === 0) return [];

    // Step 1: Deduplicate near-identical chunks
    const deduplicated = this.deduplicate(results);

    // Step 2: Enforce source diversity
    const diverse = this.enforceDiversity(deduplicated);

    // Step 3: Fit within token budget
    return this.fitTokenBudget(diverse);
  }

  private deduplicate(results: ReRankedResult[]): ReRankedResult[] {
    const unique: ReRankedResult[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      const normalized = result.content.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(normalized)) continue;

      let isDuplicate = false;
      for (const existing of unique) {
        const existingNorm = existing.content.toLowerCase().replace(/\s+/g, " ").trim();
        if (this.similarity(normalized, existingNorm) > this.dedupThreshold) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seen.add(normalized);
        unique.push(result);
      }
    }

    return unique;
  }

  private enforceDiversity(results: ReRankedResult[]): ReRankedResult[] {
    const selected: ReRankedResult[] = [];
    const documentCounts = new Map<string, number>();
    const maxPerDoc = Math.max(2, Math.ceil(results.length * 0.4));

    for (const result of results) {
      const count = documentCounts.get(result.documentId) ?? 0;
      if (count < maxPerDoc) {
        selected.push(result);
        documentCounts.set(result.documentId, count + 1);
      }
    }

    return selected;
  }

  private fitTokenBudget(results: ReRankedResult[]): ReRankedResult[] {
    let tokenEstimate = 0;
    const selected: ReRankedResult[] = [];

    for (const result of results) {
      const contentTokens = Math.ceil(result.content.length / CHARS_PER_TOKEN);
      if (tokenEstimate + contentTokens > this.maxTokens) break;
      tokenEstimate += contentTokens;
      selected.push(result);
    }

    return selected;
  }

  private similarity(a: string, b: string): number {
    const aWords = new Set(a.split(/\s+/));
    const bWords = new Set(b.split(/\s+/));
    const intersection = new Set([...aWords].filter((w) => bWords.has(w)));
    const union = new Set([...aWords, ...bWords]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}
