import { pgTable, text, timestamp, uuid, jsonb, real, boolean, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const VOICE_SESSION_STATUSES = ["active", "paused", "ended", "cancelled"] as const;
export const VOICE_TRANSCRIPT_SOURCES = ["user", "ai"] as const;

// ─── Voice Sessions ───

export const voiceSessionsTable = pgTable("voice_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id"),
  status: text("status").notNull().default("active"),
  language: text("language").default("en"),
  mode: text("mode").default("voice"),
  turnCount: integer("turn_count").default(0),
  duration: real("duration"),
  metadata: jsonb("metadata").default({}),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("voice_sessions_user_id_idx").on(t.userId),
}));

export const insertVoiceSessionSchema = createInsertSchema(voiceSessionsTable).omit({
  id: true, createdAt: true, startedAt: true,
});
export const selectVoiceSessionSchema = createSelectSchema(voiceSessionsTable);

// ─── Voice Transcripts ───

export const voiceTranscriptsTable = pgTable("voice_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => voiceSessionsTable.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("user"),
  text: text("text").notNull(),
  originalText: text("original_text"),
  confidence: real("confidence"),
  turnNumber: integer("turn_number").default(0),
  isFinal: boolean("is_final").default(true),
  isEdited: boolean("is_edited").default(false),
  editedText: text("edited_text"),
  audioChunkId: uuid("audio_chunk_id"),
  processingTimeMs: real("processing_time_ms"),
  entities: jsonb("entities").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVoiceTranscriptSchema = createInsertSchema(voiceTranscriptsTable).omit({
  id: true, createdAt: true,
});
export const selectVoiceTranscriptSchema = createSelectSchema(voiceTranscriptsTable);

// ─── Audio Chunks ───

export const voiceAudioChunksTable = pgTable("voice_audio_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => voiceSessionsTable.id, { onDelete: "cascade" }),
  storagePath: text("storage_path"),
  mimeType: text("mime_type").default("audio/webm"),
  duration: real("duration"),
  sizeBytes: integer("size_bytes"),
  transcriptId: uuid("transcript_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVoiceAudioChunkSchema = createInsertSchema(voiceAudioChunksTable).omit({
  id: true, createdAt: true,
});
export const selectVoiceAudioChunkSchema = createSelectSchema(voiceAudioChunksTable);

// ─── Speaking Timestamps ───

export const voiceSpeakingTimestampsTable = pgTable("voice_speaking_timestamps", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => voiceSessionsTable.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("user"),
  startTime: real("start_time").notNull(),
  endTime: real("end_time"),
  duration: real("duration"),
  transcriptId: uuid("transcript_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVoiceTimestampSchema = createInsertSchema(voiceSpeakingTimestampsTable).omit({
  id: true, createdAt: true,
});
export const selectVoiceTimestampSchema = createSelectSchema(voiceSpeakingTimestampsTable);

// ─── Types ───

export type VoiceSession = typeof voiceSessionsTable.$inferSelect;
export type InsertVoiceSession = z.infer<typeof insertVoiceSessionSchema>;
export type VoiceTranscript = typeof voiceTranscriptsTable.$inferSelect;
export type InsertVoiceTranscript = z.infer<typeof insertVoiceTranscriptSchema>;
export type VoiceAudioChunk = typeof voiceAudioChunksTable.$inferSelect;
export type InsertVoiceAudioChunk = z.infer<typeof insertVoiceAudioChunkSchema>;
export type VoiceSpeakingTimestamp = typeof voiceSpeakingTimestampsTable.$inferSelect;
export type InsertVoiceSpeakingTimestamp = z.infer<typeof insertVoiceTimestampSchema>;
