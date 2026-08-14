import { db, documentChunksTable, medicalDocumentsTable, knowledgeSourcesTable } from "@workspace/db";
import { sql, eq, and, inArray, count } from "drizzle-orm";
import { BaseVectorStore } from "./vectorStore";
import { VectorSearchQuery, VectorSearchResult } from "../types";

export class PgVectorStore extends BaseVectorStore {
  readonly name = "pgvector";

  async ensureCollection(): Promise<void> {
    try {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    } catch {
      // Extension may already exist or not be available
    }
  }

  async insertChunk(chunk: any, embedding: number[]): Promise<void> {
    await db.insert(documentChunksTable).values({
      ...chunk,
      embedding: embedding as any,
    });
  }

  async insertChunks(chunks: Array<{ chunk: any; embedding: number[] }>): Promise<void> {
    if (chunks.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      await db.insert(documentChunksTable).values(
        batch.map(({ chunk, embedding }) => ({
          ...chunk,
          embedding: embedding as any,
        })),
      );
    }
  }

  async search(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const topK = query.topK ?? 10;
    const minScore = query.minScore ?? 0.5;
    const embedding = query.embedding;
    const embeddingStr = `[${embedding.join(",")}]`;

    // Build filter conditions
    const conditions: ReturnType<typeof sql>[] = [];

    if (query.filters && query.filters.length > 0) {
      for (const filter of query.filters) {
        switch (filter.operator) {
          case "eq":
            conditions.push(sql`${sql.identifier(filter.field)} = ${filter.value}`);
            break;
          case "neq":
            conditions.push(sql`${sql.identifier(filter.field)} != ${filter.value}`);
            break;
          case "in": {
            const vals = filter.value as unknown[];
            conditions.push(sql`${sql.identifier(filter.field)} = ANY(${vals})`);
            break;
          }
          case "contains":
            conditions.push(sql`${sql.identifier(filter.field)} @> ${filter.value}`);
            break;
        }
      }
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    try {
      const results = await db.execute(sql`
        SELECT
          dc.id as "chunkId",
          dc.document_id as "documentId",
          dc.source_id as "sourceId",
          dc.content,
          dc.content_preview as "contentPreview",
          dc.section,
          dc.heading,
          dc.metadata,
          1 - (dc.embedding <=> ${sql.raw(embeddingStr)}::vector) as "score"
        FROM document_chunks dc
        ${whereClause}
        ORDER BY dc.embedding <=> ${sql.raw(embeddingStr)}::vector ASC
        LIMIT ${topK}
      `);

      const rows = results.rows ?? results ?? [];
      return (rows as any[])
        .filter((r) => Number(r.score) >= minScore)
        .map((r) => ({
          chunkId: String(r.chunkId),
          documentId: String(r.documentId),
          sourceId: r.sourceId ? String(r.sourceId) : undefined,
          content: String(r.content),
          contentPreview: r.contentPreview ? String(r.contentPreview) : undefined,
          section: r.section ? String(r.section) : undefined,
          heading: r.heading ? String(r.heading) : undefined,
          score: Number(r.score),
          metadata: r.metadata ? (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) : undefined,
        }));
    } catch {
      // Fallback for when pgvector is not available
      return this.fallbackSearch(query);
    }
  }

  private async fallbackSearch(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const topK = query.topK ?? 10;
    const results = await db
      .select({
        chunkId: documentChunksTable.id,
        documentId: documentChunksTable.documentId,
        sourceId: documentChunksTable.sourceId,
        content: documentChunksTable.content,
        contentPreview: documentChunksTable.contentPreview,
        section: documentChunksTable.section,
        heading: documentChunksTable.heading,
        metadata: documentChunksTable.metadata,
      })
      .from(documentChunksTable)
      .limit(topK);

    return results.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      sourceId: r.sourceId ?? undefined,
      content: r.content,
      contentPreview: r.contentPreview ?? undefined,
      section: r.section ?? undefined,
      heading: r.heading ?? undefined,
      score: 0.5,
      metadata: r.metadata as Record<string, unknown> | undefined,
    }));
  }

  async deleteChunk(chunkId: string): Promise<void> {
    await db.delete(documentChunksTable)
      .where(eq(documentChunksTable.id, chunkId));
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    await db.delete(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId));
  }

  async count(): Promise<number> {
    const [result] = await db
      .select({ value: count() })
      .from(documentChunksTable);
    return Number(result?.value ?? 0);
  }
}
