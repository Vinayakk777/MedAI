import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RAG tests.
 *
 * External dependencies are replaced:
 *  - `@workspace/db` -> in-memory fake Drizzle layer
 *  - `drizzle-orm`   -> plain-object predicate helpers understood by the fake DB
 *  - PubMed live search -> deterministic no-op
 *  - LLM -> returns no data, forcing the documented graceful fallbacks
 *
 * This exercises the real retrieval, selection, citation and caching code
 * without a database, network, or provider credentials.
 */

const dbHolder = vi.hoisted(() => ({ mock: null as any }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../helpers/drizzleMock"));

const pubmed = vi.hoisted(() => ({
  liveSearchAndIngest: vi.fn(async () => ({ articlesFound: 0, articlesIngested: 0 })),
}));

vi.mock("../../src/lib/rag/providers/pubmedLive", () => ({
  liveSearchAndIngest: pubmed.liveSearchAndIngest,
}));

const llmMock = vi.hoisted(() => ({
  generateJSON: vi.fn(async () => ({ data: null })),
  generateText: vi.fn(async () => ({ data: null })),
  streamChat: vi.fn(),
}));

vi.mock("../../src/lib/llm", () => ({
  llm: llmMock,
  getModelConfig: () => ({
    chatModel: "test-chat",
    visionModel: "test-vision",
    jsonModel: "test-json",
  }),
}));

import { CitationEngine } from "../../src/lib/rag/retrieval/citationEngine";
import { ContextSelector } from "../../src/lib/rag/retrieval/contextSelector";
import { SimpleReRanker, DiversityReRanker } from "../../src/lib/rag/retrieval/reRanker";
import { RagEngine } from "../../src/lib/rag/ragEngine";
import { ragCache } from "../../src/lib/rag/cache";
import type {
  CitationEvidence,
  EmbeddingProvider,
  HybridSearchResult,
  ReRankedResult,
  VectorStore,
} from "../../src/lib/rag/types";

const fake = () => dbHolder.mock.db.__fake;

function seedDoc(overrides: Record<string, any> = {}) {
  const [row] = fake().seed("medicalDocuments", {
    id: overrides.id ?? "doc-1",
    title: "Headache guidance",
    organization: "WHO",
    category: "guideline",
    publicationDate: new Date(),
    metadata: {},
    ...overrides,
  });
  return row;
}

function ranked(overrides: Partial<ReRankedResult> = {}): ReRankedResult {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    sourceId: "source-1",
    content: "A normal resting heart rate is usually between 60 and 100 beats per minute.",
    section: "Vitals",
    originalScore: 0.9,
    reRankScore: 0.9,
    metadata: {},
    ...overrides,
  };
}

function hybrid(overrides: Partial<HybridSearchResult> = {}): HybridSearchResult {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    sourceId: "source-1",
    content: "Headache guidance",
    semanticScore: 0.8,
    keywordScore: 0.5,
    combinedScore: 0.71,
    ...overrides,
  };
}

beforeEach(() => {
  fake().clear();
  ragCache.invalidate();
  pubmed.liveSearchAndIngest.mockClear();
  llmMock.generateJSON.mockClear();
});

describe("CitationEngine.buildCitations", () => {
  const engine = new CitationEngine();

  it("builds citations with document metadata and chunk provenance", async () => {
    seedDoc({
      id: "doc-1",
      title: "Hypertension guideline",
      organization: "WHO",
      publicationDate: new Date("2024-01-15T00:00:00Z"),
      author: "Dr. Example",
      url: "https://example.org/guideline",
      metadata: { journal: "Example Journal", pmcid: "PMC123456" },
    });

    const result = await engine.buildCitations(
      [
        ranked({
          metadata: { chunkPosition: 0.5, totalChunks: 4 },
        }),
      ],
      { text: "blood pressure" },
    );

    expect(result.citations).toHaveLength(1);
    const citation = result.citations[0];
    expect(citation).toMatchObject({
      chunkId: "chunk-1",
      documentId: "doc-1",
      sourceId: "source-1",
      organization: "WHO",
      guidelineName: "Hypertension guideline [chunk 3/4]",
      confidence: "high",
      relevanceScore: 0.9,
      section: "Vitals",
      author: "Dr. Example",
      journal: "Example Journal",
      pmcid: "PMC123456",
      sourceUrl: "https://example.org/guideline",
    });
    expect(citation.evidenceText.length).toBeLessThanOrEqual(500);
    expect(result.evidenceGroups).toHaveLength(1);
    expect(result.evidenceGroups[0]).toMatchObject({ organization: "WHO", totalRelevance: 0.9 });
  });

  it("skips results whose document metadata is missing", async () => {
    seedDoc({ id: "doc-1" });

    const result = await engine.buildCitations(
      [ranked(), ranked({ chunkId: "chunk-missing", documentId: "doc-missing" })],
      { text: "q" },
    );

    expect(result.citations.map((c) => c.chunkId)).toEqual(["chunk-1"]);
  });

  it("deduplicates repeated chunk/organization pairs", async () => {
    seedDoc({ id: "doc-1" });

    const result = await engine.buildCitations(
      [ranked(), ranked({ content: "duplicate chunk text" })],
      { text: "q" },
    );

    expect(result.citations).toHaveLength(1);
  });

  it("groups citations by organization and orders groups by total relevance", async () => {
    seedDoc({ id: "doc-a", organization: "Organization A", title: "A" });
    seedDoc({ id: "doc-b", organization: "Organization B", title: "B" });

    const result = await engine.buildCitations(
      [
        ranked({ chunkId: "a1", documentId: "doc-a", reRankScore: 0.4 }),
        ranked({ chunkId: "b1", documentId: "doc-b", reRankScore: 0.9 }),
        ranked({ chunkId: "b2", documentId: "doc-b", reRankScore: 0.8 }),
      ],
      { text: "q" },
    );

    expect(result.evidenceGroups.map((g) => g.organization)).toEqual([
      "Organization B",
      "Organization A",
    ]);
    expect(result.evidenceGroups[0].citations.map((c) => c.chunkId)).toEqual(["b1", "b2"]);
    expect(result.evidenceGroups[0].totalRelevance).toBeCloseTo(1.7);
  });

  it("assigns confidence from score and publication recency", async () => {
    const fiveYearsAgo = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
    const tenYearsAgo = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000);

    seedDoc({ id: "recent", publicationDate: new Date() });
    seedDoc({ id: "mid", publicationDate: fiveYearsAgo });
    seedDoc({ id: "old", publicationDate: tenYearsAgo });

    const result = await engine.buildCitations(
      [
        ranked({ chunkId: "c-recent", documentId: "recent", reRankScore: 0.9 }),
        ranked({ chunkId: "c-mid", documentId: "mid", reRankScore: 0.9 }),
        ranked({ chunkId: "c-old", documentId: "old", reRankScore: 0.9 }),
        ranked({ chunkId: "c-nodate", documentId: "recent", reRankScore: 0.7 }),
        ranked({ chunkId: "c-low", documentId: "recent", reRankScore: 0.5 }),
      ],
      { text: "q" },
    );

    const byChunk = new Map(result.citations.map((c) => [c.chunkId, c.confidence]));
    expect(byChunk.get("c-recent")).toBe("high");
    expect(byChunk.get("c-mid")).toBe("moderate");
    // Ten-year-old evidence falls through to the score-only branch.
    expect(byChunk.get("c-old")).toBe("moderate");
    expect(byChunk.get("c-nodate")).toBe("moderate");
    expect(byChunk.get("c-low")).toBe("low");
  });

  it("returns no groups when there are no results", async () => {
    const result = await engine.buildCitations([], { text: "q" });

    expect(result.citations).toEqual([]);
    expect(result.evidenceGroups).toEqual([]);
  });
});

describe("CitationEngine.persistCitations", () => {
  const engine = new CitationEngine();

  it("persists citations with null defaults for optional fields", async () => {
    const citations: CitationEvidence[] = [
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        organization: "WHO",
        evidenceText: "evidence",
        confidence: "moderate",
        relevanceScore: 0.7,
      },
    ];

    await engine.persistCitations(citations, { userId: "user-1" });

    const rows = fake().getRows("citationRecords");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: "user-1",
      chunkId: "chunk-1",
      documentId: "doc-1",
      organization: "WHO",
      confidence: "moderate",
      relevanceScore: 0.7,
      retrievalLogId: null,
      conversationId: null,
      sourceId: null,
      guidelineName: null,
      publicationDate: null,
      pipelineStage: null,
    });
  });

  it("does not write anything for an empty citation list", async () => {
    await engine.persistCitations([], { userId: "user-1" });
    expect(fake().getRows("citationRecords")).toHaveLength(0);
  });

  it("swallows database failures so citation persistence is non-critical", async () => {
    fake().failNext("insert", "citationRecords", new Error("db down"));

    await expect(
      engine.persistCitations(
        [
          {
            chunkId: "c",
            documentId: "d",
            organization: "o",
            evidenceText: "e",
            confidence: "low",
            relevanceScore: 0.1,
          },
        ],
        { userId: "u" },
      ),
    ).resolves.toBeUndefined();
  });

  it("returns the standard no-evidence disclosure", () => {
    expect(engine.formatNoEvidenceMessage()).toContain("No high-confidence medical evidence");
    expect(engine.formatNoEvidenceMessage()).toContain("professional medical advice");
  });
});

describe("ContextSelector", () => {
  it("returns an empty list for no input", () => {
    expect(new ContextSelector().select([])).toEqual([]);
  });

  it("deduplicates identical and near-identical chunks", () => {
    const selector = new ContextSelector();
    const content = "the quick brown fox jumps over the lazy dog";
    const selected = selector.select([
      ranked({ chunkId: "a", content }),
      ranked({ chunkId: "b", content }),
      ranked({ chunkId: "c", content: "a completely different clinical statement" }),
    ]);

    expect(selected.map((r) => r.chunkId)).toEqual(["a", "c"]);
  });

  it("caps how many chunks one document can contribute", () => {
    const selector = new ContextSelector();
    const results = Array.from({ length: 6 }, (_, i) =>
      ranked({ chunkId: `c${i}`, documentId: "same-doc", content: `unique statement number ${i}` }),
    );

    const selected = selector.select(results);
    // maxPerDoc = max(2, ceil(6 * 0.4)) = 3
    expect(selected).toHaveLength(3);
  });

  it("stops adding chunks once the token budget is exhausted", () => {
    const selector = new ContextSelector({ maxTokens: 10 });
    const selected = selector.select([
      ranked({ chunkId: "a", content: "x".repeat(20) }), // 5 tokens
      ranked({ chunkId: "b", content: "y".repeat(20) }), // 5 tokens
      ranked({ chunkId: "c", content: "z".repeat(20) }), // would exceed
    ]);

    expect(selected.map((r) => r.chunkId)).toEqual(["a", "b"]);
  });
});

describe("re-rankers", () => {
  it("SimpleReRanker favours term overlap and caps results", async () => {
    const results = await new SimpleReRanker().reRank(
      "headache fever",
      [
        hybrid({ chunkId: "match", content: "headache and fever guidance", combinedScore: 0.5 }),
        hybrid({ chunkId: "partial", content: "headache only", combinedScore: 0.5 }),
        hybrid({ chunkId: "none", content: "unrelated content", combinedScore: 0.5 }),
      ],
      2,
    );

    expect(results).toHaveLength(2);
    expect(results[0].chunkId).toBe("match");
    expect(results.every((r) => r.reRankScore <= 1)).toBe(true);
  });

  it("DiversityReRanker limits duplicate documents when enough sources exist", async () => {
    const results = await new DiversityReRanker().reRank(
      "guidance",
      [
        hybrid({ chunkId: "a", documentId: "doc-a", content: "guidance one" }),
        hybrid({ chunkId: "b", documentId: "doc-b", content: "guidance two" }),
        hybrid({ chunkId: "c", documentId: "doc-c", content: "guidance three" }),
      ],
      2,
    );

    expect(results).toHaveLength(2);
    expect(new Set(results.map((r) => r.documentId)).size).toBe(2);
  });
});

function createVectorStore(results: any[]): VectorStore & { search: ReturnType<typeof vi.fn> } {
  return {
    name: "fake-vector-store",
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
    model: "fake-embedder",
    dimensions: 3,
    generateEmbedding: vi.fn(async () => [1, 0, 0]),
    generateEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
  };
}

function vectorResult(overrides: Record<string, any> = {}) {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    sourceId: "source-1",
    content: "Headache guidance from a clinical source.",
    section: "Overview",
    score: 0.9,
    metadata: {},
    ...overrides,
  };
}

describe("RagEngine", () => {
  it("runs the retrieval pipeline and returns cited evidence", async () => {
    seedDoc({ id: "doc-1", organization: "WHO", title: "Headache guidance" });
    seedDoc({ id: "doc-2", organization: "CDC", title: "Fever guidance" });

    const vectorStore = createVectorStore([
      vectorResult({ chunkId: "chunk-1", documentId: "doc-1" }),
      vectorResult({
        chunkId: "chunk-2",
        documentId: "doc-2",
        content: "Fever guidance from a clinical source.",
      }),
    ]);

    const engine = new RagEngine({ vectorStore, embedder: createEmbedder() });
    const response = await engine.query({ text: "headache and fever guidance for adults" });

    expect(response.hasEvidence).toBe(true);
    expect(response.wasFallback).toBe(false);
    expect(response.citations).toHaveLength(2);
    expect(response.evidenceGroups.map((g) => g.organization).sort()).toEqual(["CDC", "WHO"]);
    expect(response.summary).toContain("Retrieved 2 evidence passages");
    expect(response.metrics?.totalChunksRetrieved).toBe(2);
    expect(vectorStore.search).toHaveBeenCalledOnce();
  });

  it("returns a no-evidence response when retrieval finds nothing", async () => {
    const vectorStore = createVectorStore([]);
    const engine = new RagEngine({ vectorStore, embedder: createEmbedder() });

    const response = await engine.query({ text: "a query with no matching evidence at all" });

    expect(response.hasEvidence).toBe(false);
    expect(response.citations).toEqual([]);
    expect(response.noEvidenceMessage).toContain("No high-confidence medical evidence");
    expect(response.wasFallback).toBe(false);
  });

  it("falls back gracefully when retrieval throws", async () => {
    const vectorStore = createVectorStore([]);
    vectorStore.search.mockRejectedValue(new Error("vector store offline"));

    const engine = new RagEngine({ vectorStore, embedder: createEmbedder(), maxRetries: 0 });
    const response = await engine.query({ text: "a failing retrieval query" });

    expect(response.hasEvidence).toBe(false);
    expect(response.wasFallback).toBe(true);
    expect(response.noEvidenceMessage).toContain("No high-confidence medical evidence");
  });

  it("caches identical queries unless caching is disabled", async () => {
    seedDoc({ id: "doc-1" });
    const vectorStore = createVectorStore([vectorResult()]);
    const engine = new RagEngine({ vectorStore, embedder: createEmbedder() });

    const first = await engine.query({ text: "cached query about headaches" });
    const second = await engine.query({ text: "cached query about headaches" });

    expect(second).toBe(first);
    expect(vectorStore.search).toHaveBeenCalledOnce();

    await engine.query({ text: "cached query about headaches", useCache: false });
    expect(vectorStore.search).toHaveBeenCalledTimes(2);
  });

  it("formats evidence for a prompt and includes citation provenance", async () => {
    seedDoc({
      id: "doc-1",
      organization: "WHO",
      title: "Headache guideline",
      publicationDate: new Date("2024-03-01T00:00:00Z"),
      url: "https://example.org/headache",
      metadata: { journal: "Journal", pmcid: "PMC999" },
    });

    const engine = new RagEngine({
      vectorStore: createVectorStore([vectorResult()]),
      embedder: createEmbedder(),
    });

    const { evidenceBlock, citations } = await engine.formatEvidenceForPrompt({
      text: "headache guidance for adults",
    });

    expect(citations).toHaveLength(1);
    expect(evidenceBlock).toContain("[MEDICAL EVIDENCE]");
    expect(evidenceBlock).toContain("Source: WHO");
    expect(evidenceBlock).toContain("Headache guideline");
    expect(evidenceBlock).toContain("PMCID: PMC999");
    expect(evidenceBlock).toContain("https://example.org/headache");
    expect(evidenceBlock).toContain("[Pipeline:");
    expect(evidenceBlock).toContain("[/MEDICAL EVIDENCE]");
  });

  it("formats the no-evidence disclosure when nothing is retrieved", async () => {
    const engine = new RagEngine({
      vectorStore: createVectorStore([]),
      embedder: createEmbedder(),
    });

    const { evidenceBlock, citations } = await engine.formatEvidenceForPrompt({
      text: "a query with no evidence",
    });

    expect(citations).toEqual([]);
    expect(evidenceBlock).toContain("[MEDICAL EVIDENCE]");
    expect(evidenceBlock).toContain("No high-confidence medical evidence");
    expect(evidenceBlock).toContain("[/MEDICAL EVIDENCE]");
  });
});
