import { ReRanker, ReRankedResult, HybridSearchResult } from "../types";
import { llm } from "../../llm";

interface ReRankScore {
  chunkId: string;
  relevanceScore: number;
  reasoning: string;
}

export class LLMReRanker implements ReRanker {
  readonly name = "llm";

  async reRank(query: string, results: HybridSearchResult[], topK?: number): Promise<ReRankedResult[]> {
    const k = topK ?? results.length;
    if (results.length === 0) return [];

    try {
      const chunkSummaries = results.map((r, i) => `[${i}] ${r.content.slice(0, 200)}`).join("\n\n");

      const prompt = `You are a medical relevance scorer. Given a query and retrieved chunks, score each chunk's relevance from 0.0 to 1.0.

Query: ${query}

Chunks:
${chunkSummaries}

Return a JSON array of objects with "index" (0-based) and "score" (0.0-1.0). Return ONLY the JSON array.`;

      const result = await llm.generateJSON<ReRankScore[]>({
        systemPrompt: "You are a medical document relevance scorer. Return only valid JSON.",
        userContent: prompt,
        temperature: 0.1,
        maxTokens: 2048,
      });

      if (result.data && Array.isArray(result.data)) {
        const scoreMap = new Map<number, number>();
        for (const item of result.data) {
          const idx = typeof item === "object" && item !== null ? (item as any).index ?? (item as any).chunkId : undefined;
          const score = typeof item === "object" && item !== null ? (item as any).score ?? (item as any).relevanceScore : undefined;
          if (idx !== undefined && score !== undefined) {
            scoreMap.set(Number(idx), Number(score));
          }
        }

        const ranked: ReRankedResult[] = results.map((r, i) => ({
          chunkId: r.chunkId,
          documentId: r.documentId,
          sourceId: r.sourceId,
          content: r.content,
          contentPreview: r.contentPreview,
          section: r.section,
          heading: r.heading,
          originalScore: r.combinedScore,
          reRankScore: scoreMap.get(i) ?? r.combinedScore,
          metadata: r.metadata,
        }));

        return ranked.sort((a, b) => b.reRankScore - a.reRankScore).slice(0, k);
      }
    } catch {
      // Fall through to simple re-ranking
    }

    // Fallback: use combined scores directly
    return results
      .map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        sourceId: r.sourceId,
        content: r.content,
        contentPreview: r.contentPreview,
        section: r.section,
        heading: r.heading,
        originalScore: r.combinedScore,
        reRankScore: r.combinedScore,
        metadata: r.metadata,
      }))
      .sort((a, b) => b.reRankScore - a.reRankScore)
      .slice(0, k);
  }
}
