import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hybrid retrieval tests.
 *
 * The real `HybridSearchEngine`, RRF fusion and configuration code are used.
 * Only the external data sources are replaced:
 *  - `@workspace/db` -> in-memory fake Drizzle layer
 *  - `drizzle-orm`   -> plain-object predicate helpers
 *  - vector store    -> deterministic in-test stub
 */

const dbHolder = vi.hoisted(() => ({ mock: null as any }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../helpers/drizzleMock"));

import {
  HybridSearchEngine,
  type HybridSearchParams,
} from "../../src/lib/rag/retrieval/hybridSearch";
import {
  DEFAULT_RETRIEVAL_CONFIG,
  RRF_CONFIG,
  WEIGHTED_BASELINE_CONFIG,
  resolveRetrievalConfig,
} from "../../src/lib/rag/retrieval/retrievalConfig";
import { fuseWithReciprocalRankFusion } from "../../src/lib/rag/retrieval/rrf";
import type {
  EmbeddingProvider,
  HybridSearchResult,
  VectorStore,
} from "../../src/lib/rag/types";

function hybrid(overrides: Partial<HybridSearchResult> = {}): HybridSearchResult {
  return {
    chunkId: "chunk-a",
    documentId: "doc-a",
    sourceId: "source-a",
    content: "content a",
    semanticScore: 0.8,
    keywordScore: 0,
    combinedScore: 0.8,
    metadata: { pmcid: "PMC-A" },
    ...overrides,
  };
}

function vectorResult(
  chunkId: string,
  score: number,
  overrides: Record<string, any> = {},
) {
  return {
    chunkId,
    documentId: `doc-${chunkId}`,
    sourceId: `source-${chunkId}`,
    content: `content ${chunkId}`,
    contentPreview: `preview ${chunkId}`,
    section: `section ${chunkId}`,
    heading: `heading ${chunkId}`,
    score,
    metadata: { pmcid: `PMC-${chunkId}` },
    ...overrides,
  };
}

function keywordRow(
  chunkId: string,
  rank: number,
  overrides: Record<string, any> = {},
) {
  return {
    id: chunkId,
    document_id: `doc-${chunkId}`,
    source_id: `source-${chunkId}`,
    content: `content ${chunkId}`,
    content_preview: `preview ${chunkId}`,
    section: `section ${chunkId}`,
    heading: `heading ${chunkId}`,
    metadata: { pmcid: `PMC-${chunkId}` },
    rank,
    ...overrides,
  };
}

function createVectorStore(results: any[] = []): VectorStore & {
  search: ReturnType<typeof vi.fn>;
} {
  return {
    name: "test-vector-store",
    ensureCollection: vi.fn(async () => {}),
    insertChunk: vi.fn(async () => {}),
    insertChunks: vi.fn(async () => {}),
    search: vi.fn(async () => results),
    deleteChunk: vi.fn(async () => {}),
    deleteDocumentChunks: vi.fn(async () => {}),
    count: vi.fn(async () => results.length),
  };
}

function createEmbedder(): EmbeddingProvider {
  return {
    model: "test-embedder",
    dimensions: 3,
    generateEmbedding: vi.fn(async () => [1, 0, 0]),
    generateEmbeddings: vi.fn(async (texts: string[]) =>
      texts.map(() => [1, 0, 0]),
    ),
  };
}

function setKeywordRows(rows: any[]): ReturnType<typeof vi.fn> {
  const execute = vi.fn(async () => ({ rows }));
  dbHolder.mock.db.execute = execute;
  return execute;
}

function setKeywordFailure(error = new Error("fts offline")): void {
  dbHolder.mock.db.execute = vi.fn(async () => {
    throw error;
  });
}

function collectSqlValues(node: any, output: unknown[] = []): unknown[] {
  if (node === null || node === undefined) return output;
  if (typeof node !== "object") {
    output.push(node);
    return output;
  }

  if (Array.isArray(node)) {
    for (const item of node) collectSqlValues(item, output);
    return output;
  }

  if (Array.isArray(node.values)) {
    for (const value of node.values) collectSqlValues(value, output);
  }
  if (Array.isArray(node.chunks)) {
    for (const chunk of node.chunks) collectSqlValues(chunk, output);
  }
  if (typeof node.value === "string") output.push(node.value);

  return output;
}

async function search(
  engine: HybridSearchEngine,
  params: HybridSearchParams = { query: "blood pressure guidance" },
) {
  return engine.search({
    fusion: "rrf",
    minSemanticScore: 0,
    minKeywordScore: 0,
    ...params,
  });
}

beforeEach(() => {
  dbHolder.mock.db.__fake.clear();
  setKeywordRows([]);
});

describe("Reciprocal Rank Fusion", () => {
  it("merges ranked lists and deduplicates chunk IDs", () => {
    const fused = fuseWithReciprocalRankFusion(
      [hybrid({ chunkId: "a" }), hybrid({ chunkId: "b" })],
      [hybrid({ chunkId: "b" }), hybrid({ chunkId: "c" })],
      { k: 60 },
    );

    expect(fused.map((result) => result.chunkId)).toEqual(["b", "a", "c"]);
    expect(fused).toHaveLength(3);
    expect(fused[0].rrfScore).toBeCloseTo(1 / 62 + 1 / 61);
    expect(fused[0].semanticRank).toBe(2);
    expect(fused[0].keywordRank).toBe(1);
    expect(fused[0].combinedScore).toBeGreaterThan(0.9);
    expect(fused[0].combinedScore).toBeLessThanOrEqual(1);
  });

  it("prefers semantic metadata and fills missing fields from keyword", () => {
    const fused = fuseWithReciprocalRankFusion(
      [
        hybrid({
          chunkId: "a",
          sourceId: undefined,
          section: undefined,
          metadata: { pmcid: "PMC-SEMANTIC" },
        }),
      ],
      [
        hybrid({
          chunkId: "a",
          sourceId: "source-keyword",
          section: "Keyword section",
          metadata: { pmcid: "PMC-KEYWORD" },
        }),
      ],
      { k: 60 },
    );

    expect(fused).toHaveLength(1);
    expect(fused[0].metadata).toEqual({ pmcid: "PMC-SEMANTIC" });
    expect(fused[0].sourceId).toBe("source-keyword");
    expect(fused[0].section).toBe("Keyword section");
  });

  it("breaks equal-score ties deterministically by chunk ID", () => {
    const fused = fuseWithReciprocalRankFusion(
      [hybrid({ chunkId: "b" })],
      [hybrid({ chunkId: "a" })],
      { k: 60 },
    );

    expect(fused.map((result) => result.chunkId)).toEqual(["a", "b"]);
  });

  it("applies explicit weights to each list", () => {
    const semantic = [hybrid({ chunkId: "semantic" })];
    const keyword = [hybrid({ chunkId: "keyword" })];

    expect(
      fuseWithReciprocalRankFusion(semantic, keyword, {
        k: 60,
        semanticWeight: 2,
        keywordWeight: 1,
      }).map((result) => result.chunkId),
    ).toEqual(["semantic", "keyword"]);

    expect(
      fuseWithReciprocalRankFusion(semantic, keyword, {
        k: 60,
        semanticWeight: 1,
        keywordWeight: 2,
      }).map((result) => result.chunkId),
    ).toEqual(["keyword", "semantic"]);
  });

  it("returns an empty list for empty input", () => {
    expect(fuseWithReciprocalRankFusion([], [], { k: 60 })).toEqual([]);
  });

  it("rejects an invalid smoothing constant", () => {
    expect(() =>
      fuseWithReciprocalRankFusion([hybrid()], [], { k: -1 }),
    ).toThrow(/Invalid RRF k/);
  });
});

describe("HybridSearchEngine RRF mode", () => {
  it("fuses semantic and keyword lists when both branches return results", async () => {
    const vectorStore = createVectorStore([
      vectorResult("a", 0.9),
      vectorResult("b", 0.8),
    ]);
    setKeywordRows([keywordRow("b", 10), keywordRow("c", 5)]);

    const results = await search(
      new HybridSearchEngine(vectorStore, createEmbedder()),
      { query: "blood pressure guidance", topK: 10 },
    );

    expect(results.map((result) => result.chunkId)).toEqual(["b", "a", "c"]);
    const top = results[0];
    expect(top.semanticRank).toBe(2);
    expect(top.keywordRank).toBe(1);
    expect(top.rrfScore).toBeGreaterThan(0);
    expect(top.combinedScore).toBeGreaterThan(0);
    expect(top.combinedScore).toBeLessThanOrEqual(1);
  });

  it("falls back to semantic results when keyword search fails", async () => {
    const vectorStore = createVectorStore([
      vectorResult("a", 0.9),
      vectorResult("b", 0.8),
    ]);
    setKeywordFailure();

    const results = await search(
      new HybridSearchEngine(vectorStore, createEmbedder()),
      { query: "blood pressure guidance", topK: 10 },
    );

    expect(results.map((result) => result.chunkId)).toEqual(["a", "b"]);
    // Single-branch degradation preserves the calibrated branch score.
    expect(results[0].combinedScore).toBeCloseTo(0.9);
    expect(results[0].rrfScore).toBeUndefined();
  });

  it("falls back to keyword results when semantic search fails", async () => {
    const vectorStore = createVectorStore([]);
    vectorStore.search.mockRejectedValue(new Error("vector store offline"));
    setKeywordRows([keywordRow("a", 10), keywordRow("b", 5)]);

    const results = await search(
      new HybridSearchEngine(vectorStore, createEmbedder()),
      { query: "blood pressure guidance", topK: 10 },
    );

    expect(results.map((result) => result.chunkId)).toEqual(["a", "b"]);
    expect(results[0].combinedScore).toBeCloseTo(1);
    expect(results[1].combinedScore).toBeCloseTo(0.5);
  });

  it("propagates a total retrieval failure to the existing fallback path", async () => {
    const vectorStore = createVectorStore([]);
    vectorStore.search.mockRejectedValue(new Error("vector store offline"));
    setKeywordFailure();

    await expect(
      search(new HybridSearchEngine(vectorStore, createEmbedder()), {
        query: "blood pressure guidance",
        topK: 10,
      }),
    ).rejects.toThrow("vector store offline");
  });
});

describe("HybridSearchEngine filters", () => {
  const filters = [
    { field: "category", operator: "eq" as const, value: "guideline" },
    { field: "sourceId", operator: "in" as const, value: ["src-a", "src-b"] },
  ];

  it("passes filters to the semantic store and binds keyword filter values", async () => {
    const vectorStore = createVectorStore([]);
    const execute = setKeywordRows([]);

    await search(
      new HybridSearchEngine(vectorStore, createEmbedder()),
      { query: "blood pressure guidance", topK: 5, filters },
    );

    expect(vectorStore.search).toHaveBeenCalledWith(
      expect.objectContaining({ filters }),
    );

    const values = collectSqlValues(execute.mock.calls[0][0]);
    expect(values).toEqual(
      expect.arrayContaining([
        expect.stringContaining(":*"),
        "guideline",
        "src-a",
        "src-b",
        "category",
        "sourceId",
      ]),
    );
  });

  it("ignores unsafe metadata field names in keyword SQL", async () => {
    const vectorStore = createVectorStore([]);
    const execute = setKeywordRows([]);

    await search(
      new HybridSearchEngine(vectorStore, createEmbedder()),
      {
        query: "blood pressure guidance",
        topK: 5,
        filters: [
          {
            field: "category; DROP TABLE document_chunks",
            operator: "eq",
            value: "guideline",
          },
        ],
      },
    );

    const values = collectSqlValues(execute.mock.calls[0][0]);
    expect(values).not.toContain("category; DROP TABLE document_chunks");
    expect(values).not.toContain("guideline");
  });
});

describe("HybridSearchEngine weighted baseline mode", () => {
  it("uses weighted fusion when no fusion mode is specified", async () => {
    const vectorStore = createVectorStore([vectorResult("a", 0.8)]);
    setKeywordRows([keywordRow("a", 5)]);

    const results = await new HybridSearchEngine(
      vectorStore,
      createEmbedder(),
    ).search({ query: "blood pressure guidance", topK: 10 });

    expect(results.map((result) => result.chunkId)).toEqual(["a"]);
    expect(results[0].combinedScore).toBeCloseTo(0.71);
    expect(results[0].rrfScore).toBeUndefined();
  });

  it("reproduces weighted fusion and applies the combined-score floor", async () => {
    const vectorStore = createVectorStore([vectorResult("a", 0.8)]);
    setKeywordRows([keywordRow("a", 5), keywordRow("b", 2)]);

    const results = await search(
      new HybridSearchEngine(vectorStore, createEmbedder()),
      {
        query: "blood pressure guidance",
        topK: 10,
        fusion: "weighted",
        semanticWeight: 0.7,
        keywordWeight: 0.3,
        minCombinedScore: 0.5,
      },
    );

    expect(results.map((result) => result.chunkId)).toEqual(["a"]);
    expect(results[0].semanticScore).toBeCloseTo(0.8);
    expect(results[0].keywordScore).toBeCloseTo(0.5);
    expect(results[0].combinedScore).toBeCloseTo(0.71);
    expect(results[0].rrfScore).toBeUndefined();
  });

  it("orders equal weighted scores deterministically by chunk ID", async () => {
    const vectorStore = createVectorStore([
      vectorResult("b", 0.5),
      vectorResult("a", 0.5),
    ]);
    setKeywordRows([]);

    const results = await search(
      new HybridSearchEngine(vectorStore, createEmbedder()),
      {
        query: "blood pressure guidance",
        topK: 10,
        fusion: "weighted",
        semanticWeight: 0.7,
        keywordWeight: 0.3,
        minCombinedScore: 0,
      },
    );

    expect(results.map((result) => result.chunkId)).toEqual(["a", "b"]);
  });
});

describe("retrieval configuration", () => {
  it("defaults to weighted fusion and keeps RRF available as an opt-in", () => {
    expect(DEFAULT_RETRIEVAL_CONFIG.fusion).toBe("weighted");
    expect(DEFAULT_RETRIEVAL_CONFIG.semanticWeight).toBe(0.7);
    expect(DEFAULT_RETRIEVAL_CONFIG.keywordWeight).toBe(0.3);
    expect(DEFAULT_RETRIEVAL_CONFIG.minCombinedScore).toBe(0.25);
    expect(DEFAULT_RETRIEVAL_CONFIG.candidateMultiplier).toBe(2);
    expect(DEFAULT_RETRIEVAL_CONFIG.finalTopKMultiplier).toBe(3);

    expect(WEIGHTED_BASELINE_CONFIG).toEqual(DEFAULT_RETRIEVAL_CONFIG);
    expect(RRF_CONFIG.fusion).toBe("rrf");
    expect(RRF_CONFIG.rrfK).toBe(60);
  });

  it("lets callers explicitly select either fusion mode", () => {
    expect(resolveRetrievalConfig({ fusion: "rrf" }).fusion).toBe("rrf");
    expect(resolveRetrievalConfig({ fusion: "weighted" }).fusion).toBe(
      "weighted",
    );
  });

  it("clamps out-of-range overrides to safe values", () => {
    const config = resolveRetrievalConfig({
      candidateMultiplier: 0,
      rrfK: -5,
      semanticWeight: -1,
      keywordWeight: 500,
      minCombinedScore: 2,
      finalTopKMultiplier: 100,
      fusion: "bogus" as any,
    });

    // An invalid fusion value falls back to the production default.
    expect(config.fusion).toBe("weighted");
    expect(config.candidateMultiplier).toBe(1);
    expect(config.rrfK).toBe(1);
    expect(config.semanticWeight).toBe(0);
    expect(config.keywordWeight).toBe(100);
    expect(config.minCombinedScore).toBe(1);
    expect(config.finalTopKMultiplier).toBe(20);
  });
});
