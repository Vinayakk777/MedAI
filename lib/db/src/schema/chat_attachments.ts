import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { messagesTable } from "./messages";
import { conversationsTable } from "./conversations";

// ─── Chat Attachments ───
// Tracks uploaded chat images and PDFs on disk with strict user ownership so
// that no user can access another user's medical files. The files themselves
// live under the private `uploads/chat-attachments/<userId>/` directory (never
// served statically) and are only streamed back through the authenticated
// GET /api/images/:id route.

export const chatAttachmentsTable = pgTable("chat_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  messageId: uuid("message_id").references(() => messagesTable.id, {
    onDelete: "cascade",
  }),
  conversationId: uuid("conversation_id").references(
    () => conversationsTable.id,
    { onDelete: "cascade" },
  ),
  /** "image" (analysed by the vision model) or "pdf" (text-extracted evidence). */
  kind: text("kind").notNull().default("image"),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  name: text("name").notNull(),
  size: integer("size"),
  width: integer("width"),
  height: integer("height"),
  pageCount: integer("page_count"),
  /** pending | completed | partial | failed | unsupported */
  extractionStatus: text("extraction_status").default("pending"),
  extractionError: text("extraction_error"),
  sha256: text("sha256"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("chat_attachments_user_id_idx").on(t.userId),
}));

/**
 * Per-page text extracted from an uploaded PDF. Page numbers are preserved so
 * an answer can cite "report.pdf, page 3" without re-reading the file.
 */
export const chatAttachmentPagesTable = pgTable("chat_attachment_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  attachmentId: uuid("attachment_id")
    .notNull()
    .references(() => chatAttachmentsTable.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  text: text("text").notNull(),
  charCount: integer("char_count").default(0),
  /** pdf_text | ocr | empty */
  extractionMethod: text("extraction_method").notNull().default("pdf_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  attachmentIdx: index("chat_attachment_pages_attachment_id_idx").on(t.attachmentId),
}));

export type ChatAttachmentPage = typeof chatAttachmentPagesTable.$inferSelect;

export const insertChatAttachmentSchema =
  createInsertSchema(chatAttachmentsTable).omit({
    id: true,
    createdAt: true,
  });
export const selectChatAttachmentSchema =
  createSelectSchema(chatAttachmentsTable);

export type ChatAttachment = typeof chatAttachmentsTable.$inferSelect;
export type InsertChatAttachment = z.infer<typeof insertChatAttachmentSchema>;