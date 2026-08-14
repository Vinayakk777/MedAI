export { RagEngine, getRagEngine, resetRagEngine } from "./ragEngine";
export { RagCache, ragCache } from "./cache";
export { IngestionPipeline } from "./ingestion/pipeline";
export { HybridSearchEngine } from "./retrieval/hybridSearch";
export { SimpleReRanker, DiversityReRanker } from "./retrieval/reRanker";
export { CitationEngine } from "./retrieval/citationEngine";
export { PgVectorStore } from "./vector-store/pgVectorStore";
export { BaseVectorStore } from "./vector-store/vectorStore";
export { OpenAIEmbedder, CachedEmbedder, createEmbedder } from "./embeddings/embedder";
export {
  RecursiveCharacterChunker, SentenceChunker, SectionChunker,
  registerChunker, getChunker, getAllChunkers,
} from "./ingestion/chunkingStrategy";
export {
  registerProvider, getProvider, getAllProviders, createProvider,
} from "./providers/knowledgeSourceProvider";
import "./providers/defaultSources";

export type {
  MedicalKnowledgeProvider, ProviderDocumentMeta,
  ChunkingStrategy, ChunkOptions, ChunkResult,
  EmbeddingProvider,
  VectorStore, VectorSearchQuery, VectorSearchResult, VectorFilter,
  HybridSearchResult,
  ReRanker, ReRankedResult,
  CitationEvidence, CitationGroup,
  RagQuery, RagResponse, PipelineStage,
  IngestionResult,
  RetrievalLogEntry,
  CacheEntry,
} from "./types";
