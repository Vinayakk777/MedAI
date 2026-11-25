import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LangChain adapter tests.
 *
 * These cover the boundary MedAI added on top of LangChain:
 *  - `Document` <-> MedAI result round-trips keep chunk provenance intact
 *  - the retriever adapter forwards search options and failures unchanged
 *  - the re-rank compressor uses the existing scorers
 *  - the embedding adapter delegates to LangChain's `OpenAIEmbeddings`
 *
 * No network, database or provider credentials are used.
 */

const embedderMock = vi.hoisted(() => ({
  constructorArgs: [] as Array<Record<string, unknown>>,
  embedQuery: vi.fn(async () => [0.1, 0.2, 0.3]),
  embedDocuments: vi.fn(async (texts: string[]) =>
    texts.map((_, index) => [index, 0, 0]),
  ),
}));

vi.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: class {
    constructor(args: Record<string, unknown>) {
      embedderMock.constructorArgs.push(args);
    }
    embedQuery = embedderMock.embedQuery;
    embedDocuments = embedderMock.embedDocuments;
  },
}));

import { Document } from "@langchain/core/documents";
import type { HybridSearchEngine } from "../../src/lib/rag/retrieval/hybridSearch";
import { MedAIHybridRetriever } from "../../src/lib/rag/retrieval/langchainRetriever";
import { MedAIReRankCompressor } from "../../src/lib/rag/retrieval/langchainCompressor";
import {
  RETRIEVAL_METADATA_KEY,
  documentToHybridResult,
  documentToReRankedResult,
  hybridResultToDocument,
  reRankedResultToDocument,
} from "../../src/lib/rag/retrieval/documentBridge";
import { SimpleReRanker } from "../../src/lib/rag/retrieval/reRanker";
import { OpenAIEmbedder } from "../../src/lib/rag/embeddings/embedder";
import type { HybridSearchResult, ReRankedResult } from "../../src/lib/rag/types";

function hybridResult(overrides: Partial<HybridSearchResult> = {}): HybridSearchResult {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    sourceId: "source-1",
    content: "A normal resting heart rate is usually between 60 and 100 beats per minute.",
    contentPreview: "A normal resting heart rate",
    section: "Assessment",
    heading: "Heart rate",
    semanticScore: 0.82,
    keywordScore: 0.4,
    combinedScore: 0.694,
    rrfScore: 0.032,
    semanticRank: 1,
    keywordRank: 2,
    metadata: {
      chunkPosition: 0.5,
      totalChunks: 4,
      journal: "Example Journal",
      pmcid: "PMC123",
    },
    ...overrides,
  };
}

beforeEach(() => {
  embedderMock.constructorArgs.length = 0;
  embedderMock.embedQuery.mockClear();
  embedderMock.embedDocuments.mockClear();
});

describe("document bridge", () => {
  it("round-trips hybrid results without losing chunk provenance", () => {
    const original = hybridResult();

    const document = hybridResultToDocument(original);

    expect(document).toBeInstanceOf(Document);
    expect(document.pageContent).toBe(original.content);
    expect(document.metadata[RETRIEVAL_METADATA_KEY]).toMatchObject({
      chunkId: "chunk-1",
      documentId: "doc-1",
      combinedScore: 0.694,
    });
    expect(document.metadata).toMatchObject({
      chunkPosition: 0.5,
      totalChunks: 4,
      journal: "Example Journal",
      pmcid: "PMC123",
    });

    expect(documentToHybridResult(document)).toEqual(original);
  });

  it("round-trips re-ranked results with both scores", () => {
    const original: ReRankedResult = {
      chunkId: "chunk-9",
      documentId: "doc-9",
      sourceId: "source-9",
      content: "Seek urgent care for chest pain.",
      section: "Red flags",
      heading: "Chest pain",
      originalScore: 0.55,
      reRankScore: 0.91,
      metadata: { chunkPosition: 0.25, totalChunks: 8 },
    };

    const roundTripped = documentToReRankedResult(
      reRankedResultToDocument(original),
    );

    expect(roundTripped).toEqual(original);
  });

  it("refuses documents that lost MedAI retrieval metadata", () => {
    const document = new Document({ pageContent: "unscored evidence" });

    expect(() => documentToHybridResult(document)).toThrow(/chunk provenance/);
    expect(() => documentToReRankedResult(document)).toThrow(/chunk provenance/);
  });

  it("refuses documents without a re-rank score", () => {
    const document = hybridResultToDocument(hybridResult());

    expect(() => documentToReRankedResult(document)).toThrow(/re-rank score/);
  });
});

describe("MedAIHybridRetriever", () => {
  it("returns LangChain documents and forwards search options", async () => {
    const engine = {
      search: vi.fn(async () => [hybridResult()]),
    } as unknown as HybridSearchEngine;
    const retriever = new MedAIHybridRetriever({
      engine,
      search: { topK: 7, fusion: "weighted", semanticWeight: 0.7 },
    });

    const documents = await retriever.invoke("heart rate");

    expect(engine.search).toHaveBeenCalledWith({
      topK: 7,
      fusion: "weighted",
      semanticWeight: 0.7,
      query: "heart rate",
    });
    expect(documents).toHaveLength(1);
    expect(documentToHybridResult(documents[0]).chunkId).toBe("chunk-1");
  });

  it("propagates search failures so RagEngine can retry and fall back", async () => {
    const engine = {
      search: vi.fn(async () => {
        throw new Error("pgvector unavailable");
      }),
    } as unknown as HybridSearchEngine;
    const retriever = new MedAIHybridRetriever({ engine });

    await expect(retriever.invoke("heart rate")).rejects.toThrow(
      "pgvector unavailable",
    );
  });
});

describe("MedAIReRankCompressor", () => {
  it("re-ranks documents with the existing scorer and keeps metadata", async () => {
    const compressor = new MedAIReRankCompressor(new SimpleReRanker(), {
      topK: 1,
    });
    const documents = [
      hybridResultToDocument(
        hybridResult({ chunkId: "low", combinedScore: 0.1, content: "unrelated text" }),
      ),
      hybridResultToDocument(
        hybridResult({
          chunkId: "high",
          combinedScore: 0.9,
          content: "heart rate heart rate heart rate",
        }),
      ),
    ];

    const compressed = await compressor.compressDocuments(documents, "heart rate");

    expect(compressed).toHaveLength(1);
    const result = documentToReRankedResult(compressed[0]);
    expect(result.chunkId).toBe("high");
    expect(result.originalScore).toBe(0.9);
    expect(result.reRankScore).toBeGreaterThan(0);
    expect(result.metadata).toMatchObject({ totalChunks: 4, journal: "Example Journal" });
  });

  it("returns an empty list for empty input", async () => {
    const compressor = new MedAIReRankCompressor(new SimpleReRanker());

    await expect(compressor.compressDocuments([], "query")).resolves.toEqual([]);
  });
});

describe("OpenAIEmbedder", () => {
  it("delegates to LangChain OpenAIEmbeddings and keeps the 1536-dim contract", async () => {
    const embedder = new OpenAIEmbedder({ apiKey: "test-key" });

    expect(embedder.model).toBe("text-embedding-3-small");
    expect(embedder.dimensions).toBe(1536);
    expect(embedderMock.constructorArgs[0]).toMatchObject({
      apiKey: "test-key",
      model: "text-embedding-3-small",
      dimensions: 1536,
      batchSize: 2048,
      stripNewLines: false,
    });

    await expect(embedder.generateEmbedding("heart\n rate")).resolves.toEqual([
      0.1, 0.2, 0.3,
    ]);
    expect(embedderMock.embedQuery).toHaveBeenCalledWith("heart rate");

    const batch = await embedder.generateEmbeddings(["a\n b", "c"]);
    expect(embedderMock.embedDocuments).toHaveBeenCalledWith(["a b", "c"]);
    expect(batch).toHaveLength(2);
  });

  it("does not call the provider for an empty batch", async () => {
    const embedder = new OpenAIEmbedder({ apiKey: "test-key" });

    await expect(embedder.generateEmbeddings([])).resolves.toEqual([]);
    expect(embedderMock.embedDocuments).not.toHaveBeenCalled();
  });
});
