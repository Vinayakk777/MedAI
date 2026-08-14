import { pgTable, text, timestamp, uuid, integer, jsonb, boolean, real, varchar } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Knowledge Sources Registry ───

export const knowledgeSourcesTable = pgTable("knowledge_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  organization: text("organization").notNull(),
  website: text("website"),
  apiEndpoint: text("api_endpoint"),
  apiKey: text("api_key"),
  isActive: boolean("is_active").default(true),
  sourceType: text("source_type").default("guideline"), // guideline | textbook | resource | protocol | research
  retrievalMethod: text("retrieval_method").default("ingested"), // ingested | api | webhook
  config: jsonb("config").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Medical Documents ───

export const medicalDocumentsTable = pgTable("medical_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").references(() => knowledgeSourcesTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").default("general"), // general | diagnosis | medication | prevention | self_care | lab | follow_up | emergency
  documentType: text("document_type").default("text"), // text | pdf | html | markdown | json
  url: text("url"),
  publicationDate: timestamp("publication_date"),
  version: text("version"),
  organization: text("organization").notNull(),
  author: text("author"),
  language: text("language").default("en"),
  tags: jsonb("tags").$type<string[]>().default([]),
  metadata: jsonb("metadata").default({}),
  rawContent: text("raw_content"),
  chunkCount: integer("chunk_count").default(0),
  isIndexed: boolean("is_indexed").default(false),
  isArchived: boolean("is_archived").default(false),
  checksum: text("checksum"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Document Chunks with Embeddings ───

export const documentChunksTable = pgTable("document_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => medicalDocumentsTable.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => knowledgeSourcesTable.id, { onDelete: "set null" }),
  index: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  contentPreview: text("content_preview"),
  section: text("section"),
  subsection: text("subsection"),
  heading: text("heading"),
  wordCount: integer("word_count").default(0),
  pageNumber: integer("page_number"),
  embedding: vector("embedding", { dimensions: 1536 }),
  metadata: jsonb("metadata").default({}),
  tags: jsonb("tags").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Retrieval Logs ───

export const retrievalLogsTable = pgTable("retrieval_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  query: text("query").notNull(),
  queryEmbedding: vector("query_embedding", { dimensions: 1536 }),
  retrievalType: text("retrieval_type").default("semantic"), // semantic | keyword | hybrid
  matchedChunkIds: jsonb("matched_chunk_ids").$type<string[]>().default([]),
  resultCount: integer("result_count").default(0),
  latencyMs: integer("latency_ms"),
  pipelineStage: text("pipeline_stage"), // diagnosis | self_care | medication | lab | prevention | follow_up
  contextUsed: boolean("context_used").default(false),
  wasFallback: boolean("was_fallback").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Citation Records ───

export const citationRecordsTable = pgTable("citation_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  retrievalLogId: uuid("retrieval_log_id").references(() => retrievalLogsTable.id, { onDelete: "set null" }),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id"),
  chunkId: uuid("chunk_id").notNull().references(() => documentChunksTable.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").notNull().references(() => medicalDocumentsTable.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => knowledgeSourcesTable.id, { onDelete: "set null" }),
  organization: text("organization").notNull(),
  guidelineName: text("guideline_name"),
  publicationDate: timestamp("publication_date"),
  evidenceText: text("evidence_text"),
  confidence: text("confidence").default("moderate"), // high | moderate | low
  relevanceScore: real("relevance_score"),
  pipelineStage: text("pipeline_stage"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Embedding Cache ───

export const embeddingCacheTable = pgTable("embedding_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  textHash: text("text_hash").notNull().unique(),
  text: text("text").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  model: text("model").default("text-embedding-3-small"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Schemas ───

export const insertKnowledgeSourceSchema = createInsertSchema(knowledgeSourcesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectKnowledgeSourceSchema = createSelectSchema(knowledgeSourcesTable);

export const insertMedicalDocumentSchema = createInsertSchema(medicalDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectMedicalDocumentSchema = createSelectSchema(medicalDocumentsTable);

export const insertDocumentChunkSchema = createInsertSchema(documentChunksTable).omit({ id: true, createdAt: true });
export const selectDocumentChunkSchema = createSelectSchema(documentChunksTable);

export const insertRetrievalLogSchema = createInsertSchema(retrievalLogsTable).omit({ id: true, createdAt: true });
export const selectRetrievalLogSchema = createSelectSchema(retrievalLogsTable);

export const insertCitationRecordSchema = createInsertSchema(citationRecordsTable).omit({ id: true, createdAt: true });
export const selectCitationRecordSchema = createSelectSchema(citationRecordsTable);

// ─── Types ───

export type KnowledgeSource = typeof knowledgeSourcesTable.$inferSelect;
export type InsertKnowledgeSource = z.infer<typeof insertKnowledgeSourceSchema>;

export type MedicalDocument = typeof medicalDocumentsTable.$inferSelect;
export type InsertMedicalDocument = z.infer<typeof insertMedicalDocumentSchema>;

export type DocumentChunk = typeof documentChunksTable.$inferSelect;
export type InsertDocumentChunk = z.infer<typeof insertDocumentChunkSchema>;

export type RetrievalLog = typeof retrievalLogsTable.$inferSelect;
export type InsertRetrievalLog = z.infer<typeof insertRetrievalLogSchema>;

export type CitationRecord = typeof citationRecordsTable.$inferSelect;
export type InsertCitationRecord = z.infer<typeof insertCitationRecordSchema>;
