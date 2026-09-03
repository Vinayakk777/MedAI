import { pgTable, text, timestamp, uuid, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { conversationsTable } from "./conversations";

export const messageAttachmentSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("image").default("image"),
  url: z.string(),
  mimeType: z.string(),
  name: z.string(),
  size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments").default([]).$type<MessageAttachment[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  conversationIdIdx: index("messages_conversation_id_idx").on(t.conversationId),
}));

export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ConversationMessage = typeof messagesTable.$inferSelect;
