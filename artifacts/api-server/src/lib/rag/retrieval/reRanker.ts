import { ReRanker, ReRankedResult, HybridSearchResult } from "../types";

export class SimpleReRanker implements ReRanker {
  readonly name = "simple";

  async reRank(query: string, results: HybridSearchResult[], topK?: number): Promise<ReRankedResult[]> {
    const k = topK ?? results.length;
    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    const querySet = new Set(queryTerms);

    const ranked = results.map((r) => {
      const contentLower = r.content.toLowerCase();
      const termOverlap = queryTerms.filter((t) => contentLower.includes(t)).length;
      const termRatio = queryTerms.length > 0 ? termOverlap / queryTerms.length : 0;
      const exactPhrase = query.toLowerCase().includes(r.content.toLowerCase().slice(0, 100))
        ? 0.15
        : 0;

      // Position bonus: earlier chunks get a slight boost
      const positionBonus = r.chunkId ? 0.05 : 0;

      const reRankScore =
        (r.combinedScore * 0.5) +
        (termRatio * 0.25) +
        exactPhrase +
        positionBonus;

      return {
        chunkId: r.chunkId,
        documentId: r.documentId,
        sourceId: r.sourceId,
        content: r.content,
        contentPreview: r.contentPreview,
        section: r.section,
        heading: r.heading,
        originalScore: r.combinedScore,
        reRankScore: Math.min(reRankScore, 1),
        metadata: r.metadata,
      };
    });

    return ranked
      .sort((a, b) => b.reRankScore - a.reRankScore)
      .slice(0, k);
  }
}

// ─── Diversity Re-Ranker (ensures diverse sources) ───

export class DiversityReRanker implements ReRanker {
  readonly name = "diversity";

  async reRank(query: string, results: HybridSearchResult[], topK?: number): Promise<ReRankedResult[]> {
    const k = topK ?? results.length;
    const baseRanker = new SimpleReRanker();
    const baseResults = await baseRanker.reRank(query, results, results.length);

    const selected: ReRankedResult[] = [];
    const usedDocuments = new Set<string>();

    for (const result of baseResults) {
      if (selected.length >= k) break;
      if (!usedDocuments.has(result.documentId)) {
        selected.push(result);
        usedDocuments.add(result.documentId);
      } else if (selected.length < k * 0.7) {
        // Allow some duplicates from the same document but with a score penalty
        selected.push({
          ...result,
          reRankScore: result.reRankScore * 0.85,
        });
      }
    }

    return selected.sort((a, b) => b.reRankScore - a.reRankScore).slice(0, k);
  }
}

// ─── Re-Ranker Registry ───

const reRankerRegistry = new Map<string, ReRanker>();

export function registerReRanker(ranker: ReRanker): void {
  reRankerRegistry.set(ranker.name, ranker);
}

export function getReRanker(name: string): ReRanker | undefined {
  return reRankerRegistry.get(name);
}

registerReRanker(new SimpleReRanker());
registerReRanker(new DiversityReRanker());
