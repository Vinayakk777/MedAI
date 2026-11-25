import type { KnowledgeSource, DocumentChunk, MedicalDocument } from "@workspace/db";

// ─── Provider Interface ───

export interface MedicalKnowledgeProvider {
  readonly slug: string;
  readonly name: string;
  readonly organization: string;
  readonly description: string;

  fetchDocumentList(): Promise<ProviderDocumentMeta[]>;
  fetchDocumentContent(meta: ProviderDocumentMeta): Promise<string>;
  validateSource(): Promise<boolean>;
}

export interface ProviderDocumentMeta {
  externalId: string;
  title: string;
  description?: string;
  url?: string;
  publicationDate?: Date;
  version?: string;
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ─── Chunking ───

export interface ChunkingStrategy {
  readonly name: string;
  /**
   * Splitting is asynchronous because the implementation delegates to
   * LangChain text splitters, whose `splitText` returns a promise.
   */
  chunk(text: string, options?: ChunkOptions): Promise<ChunkResult[]>;
}

export interface ChunkOptions {
  maxChunkSize?: number;
  chunkOverlap?: number;
  sectionHeadings?: string[];
}

export interface ChunkResult {
  content: string;
  index: number;
  section?: string;
  subsection?: string;
  heading?: string;
  wordCount: number;
  metadata?: Record<string, unknown>;
}

// ─── Embedding ───

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(batch: string[]): Promise<number[][]>;
}

// ─── Vector Store Interface ───

export interface VectorStore {
  readonly name: string;

  ensureCollection(): Promise<void>;
  insertChunk(chunk: DocumentChunk, embedding: number[]): Promise<void>;
  insertChunks(chunks: Array<{ chunk: DocumentChunk; embedding: number[] }>): Promise<void>;
  search(query: VectorSearchQuery): Promise<VectorSearchResult[]>;
  deleteChunk(chunkId: string): Promise<void>;
  deleteDocumentChunks(documentId: string): Promise<void>;
  count(): Promise<number>;
}

export interface VectorSearchQuery {
  embedding: number[];
  topK?: number;
  minScore?: number;
  filters?: VectorFilter[];
}

export interface VectorFilter {
  field: string;
  operator: "eq" | "neq" | "in" | "gt" | "lt" | "gte" | "lte" | "contains";
  value: unknown;
}

export interface VectorSearchResult {
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

// ─── Hybrid Search ───

export interface HybridSearchResult {
  chunkId: string;
  documentId: string;
  sourceId?: string;
  content: string;
  contentPreview?: string;
  section?: string;
  heading?: string;
  semanticScore: number;
  keywordScore: number;
  /** Fused score used by downstream ranking. Normalized to (0, 1] for RRF. */
  combinedScore: number;
  /** Raw Reciprocal Rank Fusion score when RRF fusion was used. */
  rrfScore?: number;
  /** 1-based rank in the semantic list, when present. */
  semanticRank?: number;
  /** 1-based rank in the keyword list, when present. */
  keywordRank?: number;
  metadata?: Record<string, unknown>;
}

// ─── Re-ranking ───

export interface ReRanker {
  readonly name: string;
  reRank(query: string, results: HybridSearchResult[], topK?: number): Promise<ReRankedResult[]>;
}

export interface ReRankedResult {
  chunkId: string;
  documentId: string;
  sourceId?: string;
  content: string;
  contentPreview?: string;
  section?: string;
  heading?: string;
  originalScore: number;
  reRankScore: number;
  metadata?: Record<string, unknown>;
}

// ─── Citation ───

export interface CitationEvidence {
  chunkId: string;
  documentId: string;
  sourceId?: string;
  organization: string;
  guidelineName?: string;
  publicationDate?: Date;
  evidenceText: string;
  confidence: "high" | "moderate" | "low";
  relevanceScore: number;
  section?: string;
  author?: string;
  journal?: string;
  pmcid?: string;
  sourceUrl?: string;
  /** 1-based page number for citations that come from an uploaded document. */
  pageNumber?: number;
  /** Original file name for user-uploaded documents. */
  sourceName?: string;
  /**
   * Provenance class. Attachment citations are request-scoped and must not be
   * written to the shared knowledge-base citation tables.
   */
  sourceType?: "knowledge_base" | "attachment";
}

export interface CitationGroup {
  organization: string;
  citations: CitationEvidence[];
  totalRelevance: number;
}

// ─── Pipeline Metrics ───

export interface PipelineMetrics {
  queryRewriteMs: number;
  embeddingMs: number;
  retrievalMs: number;
  rerankMs: number;
  contextSelectionMs: number;
  totalChunksRetrieved: number;
  chunksAfterDedup: number;
  usedQueryRewrite: boolean;
  usedLLMRerank: boolean;
  /** Fusion strategy used for this retrieval. */
  retrievalFusion?: "rrf" | "weighted";
}

// ─── RAG Engine ───

export interface RagQuery {
  text: string;
  userId?: string;
  pipelineStage?: PipelineStage;
  topK?: number;
  minConfidence?: "high" | "moderate" | "low";
  filters?: VectorFilter[];
  useCache?: boolean;
  /** Force query rewriting even for short queries */
  forceRewrite?: boolean;
}

export type PipelineStage =
  | "diagnosis"
  | "self_care"
  | "medication"
  | "lab"
  | "prevention"
  | "follow_up"
  | "general"
  | "triage";

export interface RagResponse {
  query: string;
  rewrittenQuery?: string;
  hasEvidence: boolean;
  evidenceGroups: CitationGroup[];
  citations: CitationEvidence[];
  summary: string;
  noEvidenceMessage?: string;
  pipelineStage: PipelineStage;
  latencyMs: number;
  wasFallback: boolean;
  /** Pipeline performance metrics for observability */
  metrics?: PipelineMetrics;
  /** Live PubMed search results */
  liveIngest?: { articlesFound: number; articlesIngested: number; articlesSkipped?: number };
}

// ─── Ingestion ───

export interface IngestionResult {
  documentId: string;
  title: string;
  chunkCount: number;
  success: boolean;
  error?: string;
}

// ─── Cache ───

export interface CacheEntry<T> {
  key: string;
  data: T;
  expiresAt: number;
  hitCount: number;
}

// ─── Retrieval Log ───

export interface RetrievalLogEntry {
  userId: string;
  query: string;
  retrievalType: string;
  matchedChunkIds: string[];
  resultCount: number;
  latencyMs: number;
  pipelineStage?: string;
  contextUsed: boolean;
  wasFallback: boolean;
}
