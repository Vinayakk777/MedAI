import { llm } from "../../llm";

interface RewriteResult {
  rewrittenQuery: string;
  originalQuery: string;
  synonymsAdded: string[];
}

export class QueryRewriter {
  async rewrite(query: string): Promise<RewriteResult> {
    const result = await llm.generateJSON<{ rewrittenQuery: string; synonymsAdded: string[] }>({
      systemPrompt: `You are a medical query rewriter. Expand patient queries with relevant medical synonyms and terminology to improve document retrieval.
Return ONLY valid JSON with "rewrittenQuery" (expanded query string) and "synonymsAdded" (array of medical terms added).`,
      userContent: `Rewrite this medical query by adding relevant clinical synonyms and terminology:
"${query}"`,
      temperature: 0.2,
      maxTokens: 512,
    });

    if (result.data?.rewrittenQuery) {
      return {
        rewrittenQuery: result.data.rewrittenQuery,
        originalQuery: query,
        synonymsAdded: result.data.synonymsAdded ?? [],
      };
    }

    return { rewrittenQuery: query, originalQuery: query, synonymsAdded: [] };
  }
}
