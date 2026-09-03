import { pgTable, text, timestamp, uuid, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const medicalMemoryTable = pgTable("medical_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),

  // Consultation metadata
  consultationDate: timestamp("consultation_date").notNull(),
  chiefComplaint: text("chief_complaint"),
  riskLevel: text("risk_level"),
  riskScore: integer("risk_score"),
  outcome: text("outcome"),
  followUpStatus: text("follow_up_status").default("pending"),

  // Structured clinical data
  symptoms: jsonb("symptoms").$type<Array<{
    name: string;
    severity: string;
    duration: string;
    bodyLocation?: string;
    progression?: string;
  }>>().default([]),
  diagnoses: jsonb("diagnoses").$type<Array<{
    name: string;
    confidence: string;
    supportingSymptoms: string[];
    warningSigns: string[];
  }>>().default([]),
  redFlags: jsonb("red_flags").$type<string[]>().default([]),

  // Lab & imaging recommendations
  labRecommendations: jsonb("lab_recommendations").$type<Array<{
    testName: string;
    priority: string;
    category: string;
  }>>().default([]),
  imagingRecommendations: jsonb("imaging_recommendations").$type<Array<{
    testName: string;
    priority: string;
  }>>().default([]),

  // Medications & allergies
  medicationRecommendations: jsonb("medication_recommendations").$type<Array<{
    name: string;
    purpose: string;
  }>>().default([]),
  drugInteractions: jsonb("drug_interactions").$type<Array<{
    description: string;
    severity: string;
  }>>().default([]),

  // Allergies & chronic conditions (accumulated over time)
  allergies: jsonb("allergies").$type<string[]>().default([]),
  chronicConditions: jsonb("chronic_conditions").$type<string[]>().default([]),
  surgicalHistory: jsonb("surgical_history").$type<string[]>().default([]),
  familyHistory: jsonb("family_history").$type<string[]>().default([]),

  // Lifestyle
  lifestyleFactors: jsonb("lifestyle_factors").$type<{
    smoking?: string;
    alcohol?: string;
    exercise?: string;
  }>().default({}),

  // Follow-up & recovery
  followUpAdvice: jsonb("follow_up_advice").$type<Array<{
    condition: string;
    whenToSeekCare: string[];
  }>>().default([]),
  recoveryStatus: text("recovery_status"),
  expectedRecoveryDays: text("expected_recovery_days"),

  // Guardrails
  isArchived: boolean("is_archived").default(false),
  isDeleted: boolean("is_deleted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("medical_memory_user_id_idx").on(t.userId),
  userIdConsultationIdx: index("medical_memory_user_id_consultation_idx").on(t.userId, t.consultationDate),
}));

export const insertMedicalMemorySchema = createInsertSchema(medicalMemoryTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectMedicalMemorySchema = createSelectSchema(medicalMemoryTable);

export type InsertMedicalMemory = z.infer<typeof insertMedicalMemorySchema>;
export type MedicalMemory = typeof medicalMemoryTable.$inferSelect;
