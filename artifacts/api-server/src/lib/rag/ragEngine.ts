import { db, retrievalLogsTable } from "@workspace/db";
import {
  RagQuery, RagResponse, CitationEvidence, PipelineStage, PipelineMetrics,
} from "./types";
import { HybridSearchEngine } from "./retrieval/hybridSearch";
import { SimpleReRanker } from "./retrieval/reRanker";
import { LLMReRanker } from "./retrieval/llmReRanker";
import { QueryRewriter } from "./retrieval/queryRewriter";
import { ContextSelector } from "./retrieval/contextSelector";
import { CitationEngine } from "./retrieval/citationEngine";
import { PgVectorStore } from "./vector-store/pgVectorStore";
import { EmbeddingProvider, VectorStore } from "./types";
import { MedAIHybridRetriever } from "./retrieval/langchainRetriever";
import { MedAIReRankCompressor } from "./retrieval/langchainCompressor";
import { documentToReRankedResult } from "./retrieval/documentBridge";
import type { DocumentInterface } from "@langchain/core/documents";
import {
  resolveRetrievalConfig,
  type RetrievalConfig,
} from "./retrieval/retrievalConfig";
import { ragCache } from "./cache";
import { createEmbedder } from "./embeddings/embedder";
import { liveSearchAndIngest } from "./providers/pubmedLive";
import { sanitizeUntrustedEvidence } from "../safety/untrustedEvidence";

/**
 * RAG Engine — Improved Pipeline Architecture
 *
 * CONCEPTUAL FLOW:
 *   User Query
 *   → Query Rewriting (expand medical synonyms)
 *   → Hybrid Retrieval (semantic 70% + keyword 30%)
 *   → LLM ReRanking (semantic relevance scoring)
 *   → Context Selection (dedup + diversity + token budget)
 *   → Citation Building (source attribution + confidence)
 *   → Answer Generation (LLM with structured evidence)
 *   → Source Tracking (persist citations for observability)
 *
 * IMPROVEMENTS OVER PREVIOUS VERSION:
 * 1. Query rewriting bridges vocabulary gap between patient language and
 *    clinical literature (e.g., "head hurts" → "cephalalgia, tension headache")
 * 2. LLM reranking scores semantic relevance, not just term overlap
 * 3. Context selection deduplicates and fits chunks within token budget
 * 4. Pipeline metrics enable observability and tuning
 *
 * ALL IMPROVEMENTS ARE GRACEFUL — if any component fails, the pipeline
 * falls back to the previous behavior. No single point of failure.
 */
export class RagEngine {
  private vectorStore: VectorStore;
  private embedder: EmbeddingProvider;
  private hybridSearch: HybridSearchEngine;
  private simpleReRanker: SimpleReRanker;
  private llmReRanker: LLMReRanker;
  private queryRewriter: QueryRewriter;
  private contextSelector: ContextSelector;
  private citationEngine: CitationEngine;
  private maxRetries: number;
  private retrievalConfig: RetrievalConfig;

  constructor(params?: {
    vectorStore?: VectorStore;
    embedder?: EmbeddingProvider;
    maxRetries?: number;
    retrievalConfig?: Partial<RetrievalConfig>;
  }) {
    this.vectorStore = params?.vectorStore ?? new PgVectorStore();
    this.embedder = params?.embedder ?? createEmbedder();
    this.hybridSearch = new HybridSearchEngine(this.vectorStore, this.embedder);
    this.simpleReRanker = new SimpleReRanker();
    this.llmReRanker = new LLMReRanker();
    this.queryRewriter = new QueryRewriter();
    this.contextSelector = new ContextSelector();
    this.citationEngine = new CitationEngine();
    this.maxRetries = params?.maxRetries ?? 2;
    this.retrievalConfig = resolveRetrievalConfig(params?.retrievalConfig);
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
    const metrics: PipelineMetrics = {
      queryRewriteMs: 0,
      embeddingMs: 0,
      retrievalMs: 0,
      rerankMs: 0,
      contextSelectionMs: 0,
      totalChunksRetrieved: 0,
      chunksAfterDedup: 0,
      usedQueryRewrite: false,
      usedLLMRerank: false,
    };

    // ── Stage 0: Live PubMed Search (on-demand ingestion) ──
    // Search PubMed for relevant open-access articles and ingest them.
    // This grows the knowledge base organically with user queries.
    // Runs in parallel with retrieval prep; errors are non-fatal.
    let liveIngestResult: { articlesFound: number; articlesIngested: number } | null = null;
    const liveIngestPromise = liveSearchAndIngest(normalizedQuery).catch((err) => {
      console.error("[rag] live PubMed search failed:", err);
      return null;
    });

    // ── Stage 1: Query Rewriting ──
    // Expand user query with medical synonyms to improve retrieval recall.
    // Skip for very short queries where rewriting adds noise.
    let searchQuery = normalizedQuery;
    if (normalizedQuery.length > 15 || query.forceRewrite) {
      const rewriteStart = Date.now();
      try {
        const rewritten = await this.queryRewriter.rewrite(normalizedQuery);
        // Only use rewritten query if it's meaningfully different and longer
        if (rewritten.rewrittenQuery.length > normalizedQuery.length * 1.2) {
          searchQuery = rewritten.rewrittenQuery;
          metrics.usedQueryRewrite = true;
        }
      } catch {
        // Graceful fallback: use original query
      }
      metrics.queryRewriteMs = Date.now() - rewriteStart;
    }

    // ── Stage 2: Hybrid Retrieval ──
    // Wait for live PubMed ingest to complete before searching,
    // so newly ingested articles are available for retrieval.
    liveIngestResult = await liveIngestPromise;
    if (liveIngestResult && liveIngestResult.articlesIngested > 0) {
      console.log(`[rag] live PubMed: ingested ${liveIngestResult.articlesIngested} new articles for this query`);
    }

    // Retrieve from both semantic (vector) and keyword (tsvector) indices.
    // Over-retrieve to give the re-ranker more candidates. Fusion strategy,
    // weights, candidate counts and the final top K are explicit config.
    //
    // LangChain is the retrieval interface here: `MedAIHybridRetriever` wraps
    // the existing `HybridSearchEngine` (pgvector + PostgreSQL FTS + weighted
    // or RRF fusion) and returns LangChain `Document`s carrying MedAI chunk
    // provenance. The SQL and fusion logic are unchanged.
    const retrievalStart = Date.now();
    const hybridTopK = Math.max(
      1,
      Math.ceil(topK * this.retrievalConfig.finalTopKMultiplier),
    );
    const retriever = new MedAIHybridRetriever({
      engine: this.hybridSearch,
      search: {
        topK: hybridTopK,
        filters: query.filters,
        fusion: this.retrievalConfig.fusion,
        candidateMultiplier: this.retrievalConfig.candidateMultiplier,
        rrfK: this.retrievalConfig.rrfK,
        semanticWeight: this.retrievalConfig.semanticWeight,
        keywordWeight: this.retrievalConfig.keywordWeight,
        minCombinedScore: this.retrievalConfig.minCombinedScore,
        minSemanticScore: this.retrievalConfig.minSemanticScore,
        minKeywordScore: this.retrievalConfig.minKeywordScore,
      },
    });
    const retrievedDocuments = await retriever.invoke(searchQuery);
    metrics.retrievalMs = Date.now() - retrievalStart;
    metrics.totalChunksRetrieved = retrievedDocuments.length;
    metrics.retrievalFusion = this.retrievalConfig.fusion;

    if (retrievedDocuments.length === 0) {
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
        metrics,
      };
    }

    // ── Stage 3: Re-ranking ──
    // Use LLM reranking for queries with enough candidates (4+ chunks).
    // Fall back to SimpleReRanker for smaller result sets or on failure.
    // Both re-rankers are exposed through LangChain's document compressor
    // contract; scoring and fallbacks are unchanged.
    const rerankStart = Date.now();
    const rerankTopK = topK * 2;
    let compressedDocuments: DocumentInterface[];
    if (retrievedDocuments.length >= 4) {
      try {
        const compressor = new MedAIReRankCompressor(this.llmReRanker, {
          topK: rerankTopK,
        });
        compressedDocuments = await compressor.compressDocuments(
          retrievedDocuments,
          searchQuery,
        );
        metrics.usedLLMRerank = true;
      } catch {
        // LLM reranker falls back internally, but if it still fails:
        const compressor = new MedAIReRankCompressor(this.simpleReRanker, {
          topK: rerankTopK,
        });
        compressedDocuments = await compressor.compressDocuments(
          retrievedDocuments,
          searchQuery,
        );
      }
    } else {
      const compressor = new MedAIReRankCompressor(this.simpleReRanker, {
        topK: rerankTopK,
      });
      compressedDocuments = await compressor.compressDocuments(
        retrievedDocuments,
        searchQuery,
      );
    }
    metrics.rerankMs = Date.now() - rerankStart;

    // Re-enter the MedAI domain model for context selection, citation
    // building and the safety gates.
    const reRanked = compressedDocuments.map(documentToReRankedResult);

    // ── Stage 4: Context Selection ──
    // Deduplicate near-identical chunks, enforce source diversity,
    // and fit within token budget.
    const selectionStart = Date.now();
    const selectedChunks = this.contextSelector.select(reRanked);
    metrics.contextSelectionMs = Date.now() - selectionStart;
    metrics.chunksAfterDedup = selectedChunks.length;

    // ── Stage 5: Citation Building ──
    // Build structured citations with source attribution and confidence.
    // Use selected (deduplicated) chunks, not all reranked results.
    const { evidenceGroups, citations } = await this.citationEngine.buildCitations(
      selectedChunks,
      query,
    );

    // ── Stage 6: Evidence Summary ──
    const summary = this.generateEvidenceSummary(evidenceGroups, normalizedQuery);

    // Log pipeline metrics for observability
    if (metrics.totalChunksRetrieved > 0) {
      console.log(
        `[rag] pipeline: rewrite=${metrics.queryRewriteMs}ms, ` +
        `retrieval=${metrics.retrievalMs}ms, rerank=${metrics.rerankMs}ms, ` +
        `context=${metrics.contextSelectionMs}ms, ` +
        `chunks=${metrics.totalChunksRetrieved}→${metrics.chunksAfterDedup}, ` +
        `rewrite=${metrics.usedQueryRewrite}, llm_rerank=${metrics.usedLLMRerank}, ` +
        `fusion=${metrics.retrievalFusion ?? "unknown"}`
      );
    }

    return {
      query: normalizedQuery,
      rewrittenQuery: metrics.usedQueryRewrite ? searchQuery : undefined,
      hasEvidence: citations.length > 0,
      evidenceGroups,
      citations,
      summary,
      pipelineStage: query.pipelineStage ?? "general",
      latencyMs: 0,
      wasFallback: false,
      metrics,
      liveIngest: liveIngestResult ?? undefined,
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
      const organization = sanitizeUntrustedEvidence(group.organization).text;
      evidenceBlock += `Source: ${organization}\n`;
      for (const citation of group.citations.slice(0, 3)) {
        const dateStr = citation.publicationDate
          ? new Date(citation.publicationDate).toLocaleDateString("en-US", {
              year: "numeric", month: "long",
            })
          : "Date not specified";
        const guidelineName = citation.guidelineName
          ? sanitizeUntrustedEvidence(citation.guidelineName).text
          : "";
        const evidenceText = sanitizeUntrustedEvidence(citation.evidenceText).text.slice(0, 300);
        evidenceBlock += `- [${citation.confidence.toUpperCase()}] `;
        if (guidelineName) evidenceBlock += `${guidelineName} (${dateStr}): `;
        evidenceBlock += `${evidenceText}...\n`;
        if (citation.author) evidenceBlock += `  Authors: ${sanitizeUntrustedEvidence(citation.author).text}\n`;
        if (citation.journal) evidenceBlock += `  Journal: ${sanitizeUntrustedEvidence(citation.journal).text}\n`;
        if (citation.pmcid) evidenceBlock += `  PMCID: ${citation.pmcid}\n`;
        if (citation.sourceUrl) evidenceBlock += `  URL: ${citation.sourceUrl}\n`;
      }
      evidenceBlock += "\n";
    }

    // Include pipeline metrics in debug output (helpful for interview demos)
    if (response.metrics) {
      const m = response.metrics;
      evidenceBlock += `[Pipeline: rewrite=${m.queryRewriteMs}ms, retrieval=${m.retrievalMs}ms, rerank=${m.rerankMs}ms, context=${m.contextSelectionMs}ms, chunks=${m.totalChunksRetrieved}→${m.chunksAfterDedup}]\n`;
    }

    // Include live PubMed ingest info
    if (response.liveIngest) {
      evidenceBlock += `[Live PubMed: found=${response.liveIngest.articlesFound} ingested=${response.liveIngest.articlesIngested}]\n`;
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
