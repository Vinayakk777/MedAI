import { Document } from "@langchain/core/documents";
import type { HybridSearchResult, ReRankedResult } from "../types";

/**
 * Bridge between MedAI's retrieval contracts and LangChain `Document`s.
 *
 * LangChain documents only guarantee `pageContent` + free-form metadata. MedAI
 * needs stronger provenance guarantees: stable chunk IDs, document IDs, fusion
 * scores and the original chunk metadata (`chunkPosition`, `totalChunks`,
 * `journal`, `pmcid`, ...) that citations depend on.
 *
 * The pipeline fields are stored under a single reserved metadata key so they
 * can never collide with chunk metadata coming from PostgreSQL. Converting a
 * document back without that key throws instead of silently dropping chunk
 * provenance.
 */
export const RETRIEVAL_METADATA_KEY = "medai_retrieval";

interface RetrievalMetadata {
  chunkId: string;
  documentId: string;
  sourceId?: string;
  contentPreview?: string;
  section?: string;
  heading?: string;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
  rrfScore?: number;
  semanticRank?: number;
  keywordRank?: number;
  originalScore?: number;
  reRankScore?: number;
}

function splitDocumentMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { [RETRIEVAL_METADATA_KEY]: _retrieval, ...chunkMetadata } = metadata;
  return chunkMetadata;
}

function readRetrievalMetadata(
  metadata: Record<string, unknown>,
): RetrievalMetadata {
  const raw = metadata[RETRIEVAL_METADATA_KEY];
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "LangChain document is missing MedAI retrieval metadata; refusing to drop chunk provenance.",
    );
  }

  const retrieval = raw as Partial<RetrievalMetadata>;
  if (
    typeof retrieval.chunkId !== "string" ||
    typeof retrieval.documentId !== "string"
  ) {
    throw new Error(
      "LangChain document has incomplete MedAI retrieval metadata; refusing to drop chunk provenance.",
    );
  }

  return {
    ...retrieval,
    chunkId: retrieval.chunkId,
    documentId: retrieval.documentId,
    semanticScore: retrieval.semanticScore ?? 0,
    keywordScore: retrieval.keywordScore ?? 0,
    combinedScore: retrieval.combinedScore ?? 0,
  };
}

export function hybridResultToDocument(result: HybridSearchResult): Document {
  const retrieval: RetrievalMetadata = {
    chunkId: result.chunkId,
    documentId: result.documentId,
    sourceId: result.sourceId,
    contentPreview: result.contentPreview,
    section: result.section,
    heading: result.heading,
    semanticScore: result.semanticScore,
    keywordScore: result.keywordScore,
    combinedScore: result.combinedScore,
    rrfScore: result.rrfScore,
    semanticRank: result.semanticRank,
    keywordRank: result.keywordRank,
  };

  return new Document({
    pageContent: result.content,
    metadata: {
      ...(result.metadata ?? {}),
      [RETRIEVAL_METADATA_KEY]: retrieval,
    },
  });
}

export function documentToHybridResult(document: Document): HybridSearchResult {
  const retrieval = readRetrievalMetadata(document.metadata);

  return {
    chunkId: retrieval.chunkId,
    documentId: retrieval.documentId,
    sourceId: retrieval.sourceId,
    content: document.pageContent,
    contentPreview: retrieval.contentPreview,
    section: retrieval.section,
    heading: retrieval.heading,
    semanticScore: retrieval.semanticScore,
    keywordScore: retrieval.keywordScore,
    combinedScore: retrieval.combinedScore,
    rrfScore: retrieval.rrfScore,
    semanticRank: retrieval.semanticRank,
    keywordRank: retrieval.keywordRank,
    metadata: splitDocumentMetadata(document.metadata),
  };
}

export function reRankedResultToDocument(result: ReRankedResult): Document {
  const retrieval: RetrievalMetadata = {
    chunkId: result.chunkId,
    documentId: result.documentId,
    sourceId: result.sourceId,
    contentPreview: result.contentPreview,
    section: result.section,
    heading: result.heading,
    semanticScore: 0,
    keywordScore: 0,
    combinedScore: result.originalScore,
    originalScore: result.originalScore,
    reRankScore: result.reRankScore,
  };

  return new Document({
    pageContent: result.content,
    metadata: {
      ...(result.metadata ?? {}),
      [RETRIEVAL_METADATA_KEY]: retrieval,
    },
  });
}

export function documentToReRankedResult(document: Document): ReRankedResult {
  const retrieval = readRetrievalMetadata(document.metadata);
  if (typeof retrieval.reRankScore !== "number") {
    throw new Error(
      "LangChain document is missing a MedAI re-rank score; refusing to pass unscored evidence downstream.",
    );
  }

  return {
    chunkId: retrieval.chunkId,
    documentId: retrieval.documentId,
    sourceId: retrieval.sourceId,
    content: document.pageContent,
    contentPreview: retrieval.contentPreview,
    section: retrieval.section,
    heading: retrieval.heading,
    originalScore: retrieval.originalScore ?? retrieval.combinedScore,
    reRankScore: retrieval.reRankScore,
    metadata: splitDocumentMetadata(document.metadata),
  };
}
