import { pgTable, text, timestamp, uuid, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const resolvedConditionsTable = pgTable("resolved_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conditionName: text("condition_name").notNull(),
  resolvedAt: timestamp("resolved_at").defaultNow().notNull(),
  notes: text("notes"),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("resolved_conditions_user_id_idx").on(t.userId),
}));

export const insertResolvedConditionSchema = createInsertSchema(resolvedConditionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
});

export const selectResolvedConditionSchema = createSelectSchema(resolvedConditionsTable);

export type InsertResolvedCondition = z.infer<typeof insertResolvedConditionSchema>;
export type ResolvedCondition = typeof resolvedConditionsTable.$inferSelect;
