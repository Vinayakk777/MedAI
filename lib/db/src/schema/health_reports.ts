import { pgTable, text, timestamp, uuid, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const healthReportsTable = pgTable("health_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id"),
  title: text("title").notNull(),
  summary: text("summary"),
  score: integer("score"),
  prevScore: integer("prev_score"),
  highlights: text("highlights").array(),
  trend: text("trend").default("stable"),
  badge: text("badge"),
  reportData: jsonb("report_data"),
  pdfGenerated: integer("pdf_generated").default(0),
  version: integer("version").default(1),
  reportDate: timestamp("report_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("health_reports_user_id_idx").on(t.userId),
  userIdReportDateIdx: index("health_reports_user_id_report_date_idx").on(t.userId, t.reportDate),
}));

const baseInsert = createInsertSchema(healthReportsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  reportDate: true,
});

export const insertHealthReportSchema = baseInsert.extend({
  highlights: z.array(z.string()).optional().default([]),
});

export const selectHealthReportSchema = createSelectSchema(healthReportsTable);

export type InsertHealthReport = z.infer<typeof insertHealthReportSchema>;
export type HealthReport = typeof healthReportsTable.$inferSelect;
