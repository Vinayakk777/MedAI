import { db, retrievalLogsTable } from "@workspace/db";
import {
  RagQuery, RagResponse, CitationEvidence, PipelineStage,
} from "./types";
import { HybridSearchEngine } from "./retrieval/hybridSearch";
import { SimpleReRanker } from "./retrieval/reRanker";
import { CitationEngine } from "./retrieval/citationEngine";
import { PgVectorStore } from "./vector-store/pgVectorStore";
import { EmbeddingProvider, VectorStore } from "./types";
import { ragCache } from "./cache";
import { createEmbedder } from "./embeddings/embedder";

export class RagEngine {
  private vectorStore: VectorStore;
  private embedder: EmbeddingProvider;
  private hybridSearch: HybridSearchEngine;
  private reRanker: SimpleReRanker;
  private citationEngine: CitationEngine;
  private maxRetries: number;

  constructor(params?: {
    vectorStore?: VectorStore;
    embedder?: EmbeddingProvider;
    maxRetries?: number;
  }) {
    this.vectorStore = params?.vectorStore ?? new PgVectorStore();
    this.embedder = params?.embedder ?? createEmbedder();
    this.hybridSearch = new HybridSearchEngine(this.vectorStore, this.embedder);
    this.reRanker = new SimpleReRanker();
    this.citationEngine = new CitationEngine();
    this.maxRetries = params?.maxRetries ?? 2;
  }

  async query(query: RagQuery): Promise<RagResponse> {
    const startTime = Date.now();
    const normalizedQuery = query.text.replace(/\s+/g, " ").trim();

    // Check cache
    if (query.useCache !== false) {
      const cached = ragCache.get(normalizedQuery, query.pipelineStage);
      if (cached) return cached;
    }

    let lastError: Error | undefined;
    let wasFallback = false;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.executeQuery(normalizedQuery, query);
        result.latencyMs = Date.now() - startTime;
        result.wasFallback = wasFallback;

        // Cache the result
        ragCache.set(normalizedQuery, result, query.pipelineStage);

        // Log retrieval
        this.logRetrieval(normalizedQuery, result, query);

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          wasFallback = true;
          // Wait before retry (exponential backoff)
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 200));
        }
      }
    }

    // Graceful fallback: return no-evidence response
    const noEvidenceResult: RagResponse = {
      query: normalizedQuery,
      hasEvidence: false,
      evidenceGroups: [],
      citations: [],
      summary: "",
      noEvidenceMessage: this.citationEngine.formatNoEvidenceMessage(),
      pipelineStage: query.pipelineStage ?? "general",
      latencyMs: Date.now() - startTime,
      wasFallback: true,
    };

    ragCache.set(normalizedQuery, noEvidenceResult, query.pipelineStage, 30000);
    return noEvidenceResult;
  }

  private async executeQuery(normalizedQuery: string, query: RagQuery): Promise<RagResponse> {
    const topK = query.topK ?? 10;

    // 1. Hybrid search
    const hybridResults = await this.hybridSearch.search({
      query: normalizedQuery,
      topK: topK * 2,
      minScore: 0.3,
      filters: query.filters,
    });

    if (hybridResults.length === 0) {
      return {
        query: normalizedQuery,
        hasEvidence: false,
        evidenceGroups: [],
        citations: [],
        summary: "",
        noEvidenceMessage: this.citationEngine.formatNoEvidenceMessage(),
        pipelineStage: query.pipelineStage ?? "general",
        latencyMs: 0,
        wasFallback: false,
      };
    }

    // 2. Re-rank
    const reRanked = await this.reRanker.reRank(normalizedQuery, hybridResults, topK);

    // 3. Build citations
    const { evidenceGroups, citations } = await this.citationEngine.buildCitations(reRanked, query);

    // 4. Generate summary
    const summary = this.generateEvidenceSummary(evidenceGroups, normalizedQuery);

    return {
      query: normalizedQuery,
      hasEvidence: citations.length > 0,
      evidenceGroups,
      citations,
      summary,
      pipelineStage: query.pipelineStage ?? "general",
      latencyMs: 0,
      wasFallback: false,
    };
  }

  private generateEvidenceSummary(groups: import("./types").CitationGroup[], query: string): string {
    if (groups.length === 0) return "";

    const mainGroup = groups[0];
    const topCitations = mainGroup.citations.slice(0, 3);
    const sourceCount = groups.length;
    const citationCount = groups.reduce((s, g) => s + g.citations.length, 0);

    return `Retrieved ${citationCount} evidence passages from ${sourceCount} medical knowledge source(s). ` +
      `Primary source: ${mainGroup.organization} (${topCitations.length} passage(s)). ` +
      `Highest confidence: ${topCitations[0]?.confidence ?? "unknown"}.`;
  }

  private async logRetrieval(
    query: string,
    response: RagResponse,
    queryParams: RagQuery,
  ): Promise<void> {
    if (!queryParams.userId) return;

    try {
      await db.insert(retrievalLogsTable).values({
        userId: queryParams.userId,
        query,
        retrievalType: "hybrid",
        matchedChunkIds: response.citations.map((c) => c.chunkId),
        resultCount: response.citations.length,
        latencyMs: response.latencyMs,
        pipelineStage: queryParams.pipelineStage ?? "general",
        contextUsed: response.hasEvidence,
        wasFallback: response.wasFallback,
      });
    } catch {
      // Non-critical
    }
  }

  async retrieveEvidence(query: RagQuery): Promise<CitationEvidence[]> {
    const response = await this.query(query);
    return response.citations;
  }

  async formatEvidenceForPrompt(query: RagQuery): Promise<{
    evidenceBlock: string;
    citations: CitationEvidence[];
  }> {
    const response = await this.query(query);

    if (!response.hasEvidence) {
      return {
        evidenceBlock: `[MEDICAL EVIDENCE]\n${response.noEvidenceMessage ?? "No medical evidence was retrieved for this query."}\n[/MEDICAL EVIDENCE]`,
        citations: [],
      };
    }

    let evidenceBlock = "[MEDICAL EVIDENCE]\n";
    evidenceBlock += `Retrieved from ${response.evidenceGroups.length} source(s):\n\n`;

    for (const group of response.evidenceGroups) {
      evidenceBlock += `Source: ${group.organization}\n`;
      for (const citation of group.citations.slice(0, 3)) {
        const dateStr = citation.publicationDate
          ? new Date(citation.publicationDate).toLocaleDateString("en-US", {
              year: "numeric", month: "long",
            })
          : "Date not specified";
        evidenceBlock += `- [${citation.confidence.toUpperCase()}] `;
        if (citation.guidelineName) evidenceBlock += `${citation.guidelineName} (${dateStr}): `;
        evidenceBlock += `${citation.evidenceText.slice(0, 300)}...\n`;
      }
      evidenceBlock += "\n";
    }

    evidenceBlock += "[/MEDICAL EVIDENCE]\n";

    return { evidenceBlock, citations: response.citations };
  }

  async ensureSetup(): Promise<void> {
    await this.vectorStore.ensureCollection();
  }
}

// Singleton
let ragEngineInstance: RagEngine | undefined;

export function getRagEngine(): RagEngine {
  if (!ragEngineInstance) {
    ragEngineInstance = new RagEngine();
  }
  return ragEngineInstance;
}

export function resetRagEngine(): void {
  ragEngineInstance = undefined;
}
