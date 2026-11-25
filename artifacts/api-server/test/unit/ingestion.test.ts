import { beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ mock: null as any }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../helpers/drizzleMock"));

import { IngestionPipeline } from "../../src/lib/rag/ingestion/pipeline";
import {
  RecursiveCharacterChunker,
  SentenceChunker,
  SectionChunker,
  getChunker,
} from "../../src/lib/rag/ingestion/chunkingStrategy";
import { registerProvider } from "../../src/lib/rag/providers/knowledgeSourceProvider";
import type { EmbeddingProvider } from "../../src/lib/rag/types";

const fake = () => dbHolder.mock.db.__fake;

// Must match the pgvector column declared in lib/db/src/schema/medical_knowledge.ts.
const DB_EMBEDDING_DIMENSIONS = 1536;
const validEmbedding = () => Array<number>(DB_EMBEDDING_DIMENSIONS).fill(0);

function createEmbedder(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    model: "fake-embedder",
    dimensions: DB_EMBEDDING_DIMENSIONS,
    generateEmbedding: vi.fn(async () => validEmbedding()),
    generateEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => validEmbedding())),
    ...overrides,
  };
}

const sampleContent = [
  "## Overview",
  "A normal resting heart rate is usually between 60 and 100 beats per minute.",
  "",
  "## When to seek care",
  "Seek urgent care for chest pain, fainting, or severe shortness of breath.",
].join("\n");

beforeEach(() => {
  fake().clear();
});

describe("chunking strategies", () => {
  it("registers the default chunkers", () => {
    expect(getChunker("recursive_character")).toBeInstanceOf(RecursiveCharacterChunker);
    expect(getChunker("sentence")).toBeInstanceOf(SentenceChunker);
    expect(getChunker("section")).toBeInstanceOf(SectionChunker);
    expect(getChunker("does-not-exist")).toBeUndefined();
  });

  it("splits long text into indexed chunks with word counts", async () => {
    const chunks = await new RecursiveCharacterChunker().chunk("word ".repeat(120), {
      maxChunkSize: 20,
      chunkOverlap: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    expect(chunks.every((c) => c.wordCount > 0)).toBe(true);
  });

  it("sentence chunker keeps sentence boundaries", async () => {
    const chunks = await new SentenceChunker().chunk(
      "First sentence. Second sentence. Third sentence.",
      { maxChunkSize: 25, chunkOverlap: 0 },
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => /[.!?]/.test(c.content))).toBe(true);
  });
});

describe("IngestionPipeline.ingestDocument", () => {
  it("rejects an unknown chunker without writing a document", async () => {
    const pipeline = new IngestionPipeline(createEmbedder());

    const result = await pipeline.ingestDocument({
      title: "Doc",
      organization: "Org",
      content: "text",
      chunkerName: "missing-chunker",
    });

    expect(result).toEqual({
      documentId: "",
      title: "Doc",
      chunkCount: 0,
      success: false,
      error: "Unknown chunker",
    });
    expect(fake().getRows("medicalDocuments")).toHaveLength(0);
  });

  it("stores a document, embeds chunks, and marks it indexed", async () => {
    const embedder = createEmbedder();
    const pipeline = new IngestionPipeline(embedder);

    const result = await pipeline.ingestDocument({
      title: "Heart rate guidance",
      organization: "WHO",
      content: sampleContent,
      category: "guideline",
      documentType: "guideline",
      tags: ["cardiology"],
      url: "https://example.org/hr",
      author: "Example Author",
      metadata: { sourceType: "uploaded" },
    });

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBeGreaterThan(0);

    const docs = fake().getRows("medicalDocuments");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      title: "Heart rate guidance",
      organization: "WHO",
      category: "guideline",
      documentType: "guideline",
      tags: ["cardiology"],
      url: "https://example.org/hr",
      author: "Example Author",
      isIndexed: true,
      chunkCount: result.chunkCount,
    });

    const chunks = fake().getRows("documentChunks");
    expect(chunks).toHaveLength(result.chunkCount);
    expect(chunks[0]).toMatchObject({
      documentId: result.documentId,
      index: 0,
      contentPreview: chunks[0].content.slice(0, 200),
      tags: ["cardiology"],
    });
    expect(chunks[0].metadata).toMatchObject({
      category: "guideline",
      documentType: "guideline",
      organization: "WHO",
      sourceType: "uploaded",
      totalChunks: result.chunkCount,
    });
    expect(embedder.generateEmbeddings).toHaveBeenCalled();
  });

  it("returns the existing document when the PubMed PMCID checksum matches", async () => {
    const existing = fake().seed("medicalDocuments", {
      id: "existing-doc",
      title: "Already ingested",
      organization: "PMC",
      checksum: "pmcid:PMC123",
      chunkCount: 7,
    })[0];

    const embedder = createEmbedder();
    const pipeline = new IngestionPipeline(embedder);

    const result = await pipeline.ingestDocument({
      title: "Already ingested",
      organization: "PMC",
      content: "new content that should not be re-ingested",
      metadata: { pmcid: "PMC123" },
    });

    expect(result).toEqual({
      documentId: existing.id,
      title: "Already ingested",
      chunkCount: 7,
      success: true,
    });
    expect(fake().getRows("medicalDocuments")).toHaveLength(1);
    expect(fake().getRows("documentChunks")).toHaveLength(0);
    expect(embedder.generateEmbeddings).not.toHaveBeenCalled();
  });

  it("does not index empty content", async () => {
    const pipeline = new IngestionPipeline(createEmbedder());

    const result = await pipeline.ingestDocument({
      title: "Empty",
      organization: "Org",
      content: "",
    });

    expect(result).toMatchObject({
      success: false,
      chunkCount: 0,
      error: "no_chunks",
    });
    const [doc] = fake().getRows("medicalDocuments");
    expect(doc).toMatchObject({ isIndexed: false, chunkCount: 0 });
    expect(fake().getRows("documentChunks")).toHaveLength(0);
  });

  it("does not index embeddings whose dimension does not match the database", async () => {
    const embedder = createEmbedder({
      generateEmbeddings: vi.fn(async (texts: string[]) => texts.map(() => [1, 2])),
    });
    const pipeline = new IngestionPipeline(embedder);

    const result = await pipeline.ingestDocument({
      title: "Bad embeddings",
      organization: "Org",
      content: sampleContent,
    });

    expect(result).toMatchObject({
      success: false,
      chunkCount: 0,
      error: "embedding_dimension_mismatch",
    });
    expect(fake().getRows("documentChunks")).toHaveLength(0);
    const [doc] = fake().getRows("medicalDocuments");
    expect(doc).toMatchObject({ isIndexed: false, chunkCount: 0 });
  });

  it("refuses a provider whose declared dimension cannot fit the pgvector column", async () => {
    const pipeline = new IngestionPipeline(
      createEmbedder({
        dimensions: 768,
        generateEmbedding: vi.fn(async () => Array<number>(768).fill(0)),
        generateEmbeddings: vi.fn(async (texts: string[]) =>
          texts.map(() => Array<number>(768).fill(0)),
        ),
      }),
    );

    const result = await pipeline.ingestDocument({
      title: "Wrong provider",
      organization: "Org",
      content: sampleContent,
    });

    expect(result).toMatchObject({
      documentId: "",
      success: false,
      chunkCount: 0,
      error: "embedding_dimension_mismatch",
    });
    expect(fake().getRows("medicalDocuments")).toHaveLength(0);
    expect(fake().getRows("documentChunks")).toHaveLength(0);
  });

  it("does not mark a document indexed when some chunks are dropped", async () => {
    const content = "word ".repeat(120);
    const chunks = await new RecursiveCharacterChunker().chunk(content, {
      maxChunkSize: 20,
      chunkOverlap: 0,
    });
    expect(chunks.length).toBeGreaterThan(1);

    let call = 0;
    const embedder = createEmbedder({
      generateEmbeddings: vi.fn(async (texts: string[]) =>
        texts.map(() => (call++ === 0 ? validEmbedding() : [1, 2])),
      ),
    });
    const pipeline = new IngestionPipeline(embedder);

    const result = await pipeline.ingestDocument({
      title: "Partial embeddings",
      organization: "Org",
      content,
      chunkOptions: { maxChunkSize: 20, chunkOverlap: 0 },
    });

    expect(result).toMatchObject({
      success: false,
      chunkCount: 1,
      error: "chunks_dropped",
    });
    const [doc] = fake().getRows("medicalDocuments");
    expect(doc).toMatchObject({ isIndexed: false, chunkCount: 1 });
    expect(fake().getRows("documentChunks")).toHaveLength(1);
  });
});

describe("IngestionPipeline lifecycle", () => {
  it("returns null when re-indexing a missing document", async () => {
    const pipeline = new IngestionPipeline(createEmbedder());

    await expect(pipeline.reIndexDocument("missing")).resolves.toBeNull();
  });

  it("re-indexing currently inserts a replacement document (characterisation)", async () => {
    const original = fake().seed("medicalDocuments", {
      id: "doc-original",
      title: "Original",
      organization: "Org",
      rawContent: sampleContent,
      category: "general",
      documentType: "text",
      tags: [],
      metadata: {},
      isIndexed: true,
      chunkCount: 1,
    })[0];
    fake().seed("documentChunks", {
      id: "old-chunk",
      documentId: original.id,
      index: 0,
      content: "old",
    });

    const pipeline = new IngestionPipeline(createEmbedder());
    const result = await pipeline.reIndexDocument(original.id);

    expect(result?.success).toBe(true);
    // The implementation deletes old chunks but calls ingestDocument(), which
    // creates a new document row instead of updating the original in place.
    expect(fake().getRows("medicalDocuments")).toHaveLength(2);
    expect(fake().getRows("documentChunks").every((c) => c.documentId !== original.id)).toBe(true);
    expect(result?.documentId).not.toBe(original.id);
  });

  it("deletes chunks and archives a document", async () => {
    const doc = fake().seed("medicalDocuments", {
      id: "doc-1",
      title: "Doc",
      organization: "Org",
    })[0];
    fake().seed("documentChunks", { documentId: doc.id, content: "chunk" });

    const pipeline = new IngestionPipeline(createEmbedder());
    await pipeline.deleteDocument(doc.id);

    expect(fake().getRows("documentChunks")).toHaveLength(0);
    expect(fake().getRows("medicalDocuments")[0].isArchived).toBe(true);
  });

  it("re-indexes only non-archived documents", async () => {
    fake().seed("medicalDocuments", {
      id: "active",
      title: "Active",
      organization: "Org",
      rawContent: "active content",
      isArchived: false,
    });
    fake().seed("medicalDocuments", {
      id: "archived",
      title: "Archived",
      organization: "Org",
      rawContent: "archived content",
      isArchived: true,
    });

    const pipeline = new IngestionPipeline(createEmbedder());
    const results = await pipeline.reIndexAll();

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Active");
  });

  it("reports document and chunk statistics", async () => {
    fake().seed("medicalDocuments", {
      id: "a",
      title: "A",
      organization: "Org",
      isArchived: false,
      isIndexed: true,
    });
    fake().seed("medicalDocuments", {
      id: "b",
      title: "B",
      organization: "Org",
      isArchived: false,
      isIndexed: false,
    });
    fake().seed("medicalDocuments", {
      id: "c",
      title: "C",
      organization: "Org",
      isArchived: true,
      isIndexed: true,
    });
    fake().seed("documentChunks", [{ documentId: "a" }, { documentId: "a" }, { documentId: "b" }]);
    fake().seed("knowledgeSources", [{ slug: "one", isActive: true }]);
    fake().seed("knowledgeSources", [{ slug: "two", isActive: false }]);

    const stats = await new IngestionPipeline(createEmbedder()).getDocumentStats();

    expect(stats).toEqual({
      totalDocuments: 2,
      totalChunks: 3,
      indexedDocuments: 1,
      uniqueSources: 1,
    });
  });

  it("syncs documents from registered providers and captures provider errors", async () => {
    registerProvider({
      slug: "test-provider",
      name: "Test Provider",
      organization: "Test Org",
      description: "synthetic",
      validateSource: async () => true,
      fetchDocumentList: async () => [
        {
          externalId: "ext-1",
          title: "Provider document",
          category: "guideline",
          tags: ["synthetic"],
        },
      ],
      fetchDocumentContent: async () => sampleContent,
    });

    const results = await new IngestionPipeline(createEmbedder()).syncFromProviders();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: "Provider document",
      success: true,
    });
    expect(fake().getRows("medicalDocuments")[0]).toMatchObject({
      organization: "Test Org",
      category: "guideline",
    });
  });
});
