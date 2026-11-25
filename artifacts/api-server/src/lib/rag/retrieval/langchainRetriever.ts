import { BaseRetriever } from "@langchain/core/retrievers";
import type { BaseRetrieverInput } from "@langchain/core/retrievers";
import type { CallbackManagerForRetrieverRun } from "@langchain/core/callbacks/manager";
import type { Document } from "@langchain/core/documents";
import type { HybridSearchEngine, HybridSearchParams } from "./hybridSearch";
import { hybridResultToDocument } from "./documentBridge";

export interface MedAIHybridRetrieverFields extends BaseRetrieverInput {
  /** The existing MedAI hybrid engine (pgvector + PostgreSQL FTS). */
  engine: HybridSearchEngine;
  /** Search options applied to every invocation (fusion, weights, filters...). */
  search?: Omit<HybridSearchParams, "query">;
}

/**
 * LangChain-compatible retriever for MedAI's hybrid search.
 *
 * LangChain has no retriever that understands MedAI's schema (pgvector column,
 * `document_chunks` full-text index, weighted/RRF fusion, metadata filters).
 * Instead of duplicating that logic with a weaker implementation, this adapter
 * exposes the existing `HybridSearchEngine` through the standard
 * `BaseRetriever` interface, so the pipeline can use `invoke()` and LangChain
 * `Document`s while the SQL, fusion and failure semantics stay unchanged.
 *
 * Failure semantics are inherited: if both branches fail, `invoke()` rejects,
 * which lets `RagEngine` retry and fall back to the no-evidence response.
 */
export class MedAIHybridRetriever extends BaseRetriever {
  static lc_name(): string {
    return "MedAIHybridRetriever";
  }

  lc_namespace = ["medai", "retrievers", "hybrid"];

  private engine: HybridSearchEngine;
  private search: Omit<HybridSearchParams, "query">;

  constructor(fields: MedAIHybridRetrieverFields) {
    super(fields);
    this.engine = fields.engine;
    this.search = fields.search ?? {};
  }

  async _getRelevantDocuments(
    query: string,
    _callbacks?: CallbackManagerForRetrieverRun,
  ): Promise<Document[]> {
    const results = await this.engine.search({ ...this.search, query });
    return results.map(hybridResultToDocument);
  }
}
