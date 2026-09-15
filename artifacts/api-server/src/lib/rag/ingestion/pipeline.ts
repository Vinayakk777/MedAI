import { db } from "@workspace/db";
import { medicalDocumentsTable, documentChunksTable, knowledgeSourcesTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { EmbeddingProvider, IngestionResult } from "../types";
import { getChunker, getAllChunkers } from "./chunkingStrategy";
import { getActiveProviders, fetchFromProvider } from "../providers/knowledgeSourceProvider";

export interface IngestionPipelineOptions {
  chunkerName?: string;
  maxChunkSize?: number;
  chunkOverlap?: number;
  batchSize?: number;
}

export class IngestionPipeline {
  private embedder: EmbeddingProvider;

  constructor(embedder: EmbeddingProvider) {
    this.embedder = embedder;
  }

  async ingestDocument(params: {
    sourceId?: string;
    title: string;
    organization: string;
    content: string;
    category?: string;
    documentType?: string;
    publicationDate?: Date;
    version?: string;
    tags?: string[];
    url?: string;
    author?: string;
    metadata?: Record<string, unknown>;
    chunkerName?: string;
    chunkOptions?: { maxChunkSize?: number; chunkOverlap?: number };
  }): Promise<IngestionResult> {
    const chunker = getChunker(params.chunkerName ?? "recursive_character");
    if (!chunker) {
      return { documentId: "", title: params.title, chunkCount: 0, success: false, error: "Unknown chunker" };
    }

    // Duplicate detection: check if a document with the same title and organization already exists
    const pmcid = params.metadata?.pmcid as string | undefined;
    const existingChecksum = pmcid ? `pmcid:${pmcid}` : undefined;
    if (existingChecksum) {
      const [existing] = await db
        .select({ id: medicalDocumentsTable.id, chunkCount: medicalDocumentsTable.chunkCount })
        .from(medicalDocumentsTable)
        .where(eq(medicalDocumentsTable.checksum, existingChecksum))
        .limit(1);
      if (existing) {
        return {
          documentId: existing.id,
          title: params.title,
          chunkCount: existing.chunkCount ?? 0,
          success: true,
        };
      }
    }

    // Create document record
    const [doc] = await db
      .insert(medicalDocumentsTable)
      .values({
        sourceId: params.sourceId ?? null,
        title: params.title,
        organization: params.organization,
        rawContent: params.content,
        category: params.category ?? "general",
        documentType: params.documentType ?? "text",
        publicationDate: params.publicationDate ?? null,
        version: params.version ?? null,
        tags: params.tags ?? [],
        url: params.url ?? null,
        author: params.author ?? null,
        metadata: params.metadata ?? {},
        checksum: pmcid ? `pmcid:${pmcid}` : null,
        isIndexed: false,
      })
      .returning();

    // Chunk
    const chunks = chunker.chunk(params.content, {
      maxChunkSize: params.chunkOptions?.maxChunkSize ?? 1000,
      chunkOverlap: params.chunkOptions?.chunkOverlap ?? 100,
    });

    if (chunks.length === 0) {
      await db.update(medicalDocumentsTable)
        .set({ isIndexed: true, chunkCount: 0 })
        .where(eq(medicalDocumentsTable.id, doc.id));
      return {
        documentId: doc.id,
        title: params.title,
        chunkCount: 0,
        success: true,
      };
    }

    // Generate embeddings in batches
    const batchSize = 20;
    const chunkRecords: Array<{ chunk: typeof chunks[0]; embedding: number[] }> = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);
      const embeddings = await this.embedder.generateEmbeddings(texts);
      for (let j = 0; j < batch.length; j++) {
        chunkRecords.push({ chunk: batch[j], embedding: embeddings[j] ?? [] });
      }
    }

    // Insert chunks with enriched metadata
    const validRecords = chunkRecords.filter((r) => r.embedding.length === this.embedder.dimensions);
    if (validRecords.length > 0) {
      await db.insert(documentChunksTable).values(
        validRecords.map((r) => ({
          documentId: doc.id,
          sourceId: params.sourceId ?? null,
          index: r.chunk.index,
          content: r.chunk.content,
          contentPreview: r.chunk.content.slice(0, 200),
          section: r.chunk.section ?? null,
          heading: r.chunk.heading ?? null,
          wordCount: r.chunk.wordCount,
          embedding: r.embedding,
          metadata: {
            ...(r.chunk.metadata ?? {}),
            // Enrich with context metadata for retrieval filtering
            category: params.category ?? "general",
            documentType: params.documentType ?? "text",
            organization: params.organization,
            sourceType: params.metadata?.sourceType ?? "uploaded",
            chunkPosition: r.chunk.index / Math.max(chunks.length - 1, 1),
            totalChunks: chunks.length,
          } as Record<string, unknown>,
          tags: params.tags ?? [],
        })),
      );
    }

    // Update document
    await db.update(medicalDocumentsTable)
      .set({ isIndexed: true, chunkCount: validRecords.length })
      .where(eq(medicalDocumentsTable.id, doc.id));

    return {
      documentId: doc.id,
      title: params.title,
      chunkCount: validRecords.length,
      success: true,
    };
  }

  async syncFromProviders(): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    const providers = getActiveProviders();

    for (const provider of providers) {
      try {
        const docs = await fetchFromProvider(provider);
        for (const docMeta of docs) {
          const content = await provider.fetchDocumentContent(docMeta);
          const result = await this.ingestDocument({
            sourceId: undefined,
            title: docMeta.title,
            organization: provider.organization,
            content,
            category: docMeta.category,
            publicationDate: docMeta.publicationDate,
            version: docMeta.version,
            tags: docMeta.tags,
            url: docMeta.url,
            metadata: docMeta.metadata,
          });
          results.push(result);
        }
      } catch (err) {
        results.push({
          documentId: "",
          title: `${provider.name} sync`,
          chunkCount: 0,
          success: false,
          error: String(err),
        });
      }
    }

    return results;
  }

  async reIndexDocument(documentId: string): Promise<IngestionResult | null> {
    const [doc] = await db
      .select()
      .from(medicalDocumentsTable)
      .where(eq(medicalDocumentsTable.id, documentId))
      .limit(1);

    if (!doc || !doc.rawContent) return null;

    // Delete old chunks
    await db.delete(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId));

    return this.ingestDocument({
      sourceId: doc.sourceId ?? undefined,
      title: doc.title,
      organization: doc.organization,
      content: doc.rawContent,
      category: doc.category ?? undefined,
      documentType: doc.documentType ?? undefined,
      publicationDate: doc.publicationDate ?? undefined,
      version: doc.version ?? undefined,
      tags: doc.tags ?? [],
      url: doc.url ?? undefined,
      metadata: doc.metadata as Record<string, unknown> | undefined,
    });
  }

  async reIndexAll(): Promise<IngestionResult[]> {
    const docs = await db
      .select()
      .from(medicalDocumentsTable)
      .where(eq(medicalDocumentsTable.isArchived, false));

    const results: IngestionResult[] = [];
    for (const doc of docs) {
      const result = await this.reIndexDocument(doc.id);
      if (result) results.push(result);
    }
    return results;
  }

  async deleteDocument(documentId: string): Promise<void> {
    await db.delete(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId));
    await db.update(medicalDocumentsTable)
      .set({ isArchived: true })
      .where(eq(medicalDocumentsTable.id, documentId));
  }

  async getDocumentStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    indexedDocuments: number;
    uniqueSources: number;
  }> {
    const [docCount] = await db
      .select({ value: count() })
      .from(medicalDocumentsTable)
      .where(eq(medicalDocumentsTable.isArchived, false));

    const [chunkCount] = await db
      .select({ value: count() })
      .from(documentChunksTable);

    const [indexedCount] = await db
      .select({ value: count() })
      .from(medicalDocumentsTable)
      .where(and(eq(medicalDocumentsTable.isIndexed, true), eq(medicalDocumentsTable.isArchived, false)));

    const [sourceCount] = await db
      .select({ value: count() })
      .from(knowledgeSourcesTable)
      .where(eq(knowledgeSourcesTable.isActive, true));

    return {
      totalDocuments: Number(docCount?.value ?? 0),
      totalChunks: Number(chunkCount?.value ?? 0),
      indexedDocuments: Number(indexedCount?.value ?? 0),
      uniqueSources: Number(sourceCount?.value ?? 0),
    };
  }
}
