import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { messagesTable } from "./messages";
import { conversationsTable } from "./conversations";

// ─── Chat Image Attachments ───
// Tracks uploaded chat images on disk with strict user ownership so that no
// user can access another user's medical images. The files themselves live in
// the private `uploads/chat-images/` directory (never served statically) and
// are only streamed back through the authenticated GET /api/images/:id route.

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
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  name: text("name").notNull(),
  size: integer("size"),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatAttachmentSchema =
  createInsertSchema(chatAttachmentsTable).omit({
    id: true,
    createdAt: true,
  });
export const selectChatAttachmentSchema =
  createSelectSchema(chatAttachmentsTable);

export type ChatAttachment = typeof chatAttachmentsTable.$inferSelect;
export type InsertChatAttachment = z.infer<typeof insertChatAttachmentSchema>;