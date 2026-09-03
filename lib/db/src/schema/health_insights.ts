import { pgTable, text, timestamp, uuid, integer, jsonb, boolean, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const healthInsightsTable = pgTable("health_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(), // overview | symptom_trend | vital_trend | lifestyle | medication | preventive | recovery
  title: text("title").notNull(),
  description: text("description").notNull(),
  confidence: text("confidence").default("moderate"), // high | moderate | low
  relevanceScore: integer("relevance_score").default(50),
  isActionable: boolean("is_actionable").default(false),
  suggestedAction: text("suggested_action"),
  relatedSymptoms: jsonb("related_symptoms").$type<string[]>().default([]),
  relatedMetrics: jsonb("related_metrics").$type<string[]>().default([]),
  sourceData: jsonb("source_data").default({}),
  isRead: boolean("is_read").default(false),
  isDismissed: boolean("is_dismissed").default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("health_insights_user_id_idx").on(t.userId),
}));

export const wellnessGoalsTable = pgTable("wellness_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(), // sleep | activity | hydration | nutrition | weight | bp | glucose | stress | custom
  targetValue: real("target_value"),
  targetUnit: text("target_unit"),
  currentValue: real("current_value").default(0),
  frequency: text("frequency").default("daily"), // daily | weekly | monthly
  streak: integer("streak").default(0),
  bestStreak: integer("best_streak").default(0),
  totalCompletions: integer("total_completions").default(0),
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  status: text("status").default("active"), // active | completed | archived
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("wellness_goals_user_id_idx").on(t.userId),
}));

export const goalLogsTable = pgTable("goal_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  goalId: uuid("goal_id").notNull(),
  value: real("value"),
  note: text("note"),
  loggedAt: timestamp("logged_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("goal_logs_user_id_idx").on(t.userId),
  goalIdIdx: index("goal_logs_goal_id_idx").on(t.goalId),
}));

export const preventiveRemindersTable = pgTable("preventive_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(), // checkup | screening | vaccination | dental | eye | lifestyle
  title: text("title").notNull(),
  description: text("description"),
  frequency: text("frequency"), // annual | biannual | monthly | once
  dueDate: timestamp("due_date"),
  isCompleted: boolean("is_completed").default(false),
  completedAt: timestamp("completed_at"),
  isDismissed: boolean("is_dismissed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("preventive_reminders_user_id_idx").on(t.userId),
}));

export const notificationProvidersTable = pgTable("notification_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(), // email | push | sms | in_app
  enabled: boolean("enabled").default(false),
  config: jsonb("config").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("notification_providers_user_id_idx").on(t.userId),
}));

export const insertHealthInsightSchema = createInsertSchema(healthInsightsTable).omit({ id: true, createdAt: true });
export const selectHealthInsightSchema = createSelectSchema(healthInsightsTable);
export const insertWellnessGoalSchema = createInsertSchema(wellnessGoalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectWellnessGoalSchema = createSelectSchema(wellnessGoalsTable);
export const insertGoalLogSchema = createInsertSchema(goalLogsTable).omit({ id: true, loggedAt: true });
export const insertPreventiveReminderSchema = createInsertSchema(preventiveRemindersTable).omit({ id: true, createdAt: true });
export const insertNotificationProviderSchema = createInsertSchema(notificationProvidersTable).omit({ id: true, createdAt: true, updatedAt: true });

export type HealthInsight = typeof healthInsightsTable.$inferSelect;
export type WellnessGoal = typeof wellnessGoalsTable.$inferSelect;
export type GoalLog = typeof goalLogsTable.$inferSelect;
export type PreventiveReminder = typeof preventiveRemindersTable.$inferSelect;
export type NotificationProvider = typeof notificationProvidersTable.$inferSelect;
