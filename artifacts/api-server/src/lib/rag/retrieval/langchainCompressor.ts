import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import type { Callbacks } from "@langchain/core/callbacks/manager";
import type { DocumentInterface } from "@langchain/core/documents";
import type { ReRanker } from "../types";
import {
  documentToHybridResult,
  reRankedResultToDocument,
} from "./documentBridge";

/**
 * LangChain `BaseDocumentCompressor` adapter around MedAI's re-rankers.
 *
 * LangChain's re-rankers are model-specific and would re-score chunks without
 * MedAI's fusion scores, chunk provenance or graceful fallback. This adapter
 * keeps the existing `SimpleReRanker` / `LLMReRanker` scoring (and their
 * fallbacks) but exposes them through the LangChain compressor contract, so
 * documents flow retrieval -> compression -> context selection without leaving
 * LangChain's `Document` shape.
 */
export class MedAIReRankCompressor extends BaseDocumentCompressor {
  static lc_name(): string {
    return "MedAIReRankCompressor";
  }

  readonly reRanker: ReRanker;
  private readonly topK?: number;

  constructor(reRanker: ReRanker, params?: { topK?: number }) {
    super();
    this.reRanker = reRanker;
    this.topK = params?.topK;
  }

  async compressDocuments(
    documents: DocumentInterface[],
    query: string,
    _callbacks?: Callbacks,
  ): Promise<DocumentInterface[]> {
    if (documents.length === 0) return [];

    const results = documents.map(documentToHybridResult);
    const reRanked = await this.reRanker.reRank(query, results, this.topK);
    return reRanked.map(reRankedResultToDocument);
  }
}
