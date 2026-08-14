import { pgTable, text, timestamp, uuid, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralsTable = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),

  careLevel: text("care_level").notNull(), // self_care | pcp | urgent_care | emergency_today | emergency_now
  urgencyLabel: text("urgency_label").notNull(),
  urgencyReason: text("urgency_reason").notNull(),
  estimatedSeekTime: text("estimated_seek_time"),
  preparationInstructions: jsonb("preparation_instructions").$type<string[]>().default([]),
  whatToBring: jsonb("what_to_bring").$type<string[]>().default([]),
  whatToTellDoctor: jsonb("what_to_tell_doctor").$type<string[]>().default([]),

  // Full handoff data
  handoffSummary: jsonb("handoff_summary").$type<HandoffSummaryData | null>().default(null),

  // Status
  status: text("status").default("active"), // active | completed | declined | expired
  followUpOutcome: text("follow_up_outcome"),
  followUpNotes: text("follow_up_notes"),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export interface HandoffSummaryData {
  patientInfo: {
    age?: string;
    sex?: string;
    height?: string;
    weight?: string;
    bmi?: string;
  };
  chiefComplaint: string;
  historyOfPresentIllness: {
    timeline: string;
    duration: string;
    severity: string;
    progression: string;
  };
  relevantMedicalHistory: string[];
  currentMedications: string[];
  allergies: string[];
  vitalSigns: {
    heartRate?: number | null;
    systolic?: number | null;
    diastolic?: number | null;
    temperature?: string | null;
    oxygenSaturation?: number | null;
    respiratoryRate?: number | null;
    bloodGlucose?: string | null;
    painScore?: number | null;
  };
  differentialDiagnoses: Array<{
    condition: string;
    confidence: string;
    supportingSymptoms: string[];
  }>;
  riskAssessment: {
    overallScore: number | null;
    riskCategory: string | null;
    emergencyFlags: string[];
    redFlags: Array<{ category: string; flag: string }>;
  };
  recommendedInvestigations: Array<{
    testName: string;
    reason: string;
    priority: string;
  }>;
  redFlagFindings: string[];
  aiClinicalSummary: string;
  followUpAlreadyAttempted: string[];
  outstandingQuestions: string[];
  previousConsultations: Array<{
    date: string;
    chiefComplaint: string | null;
    outcome: string | null;
  }>;
  disclaimer: string;
  generatedAt: string;
}

export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectReferralSchema = createSelectSchema(referralsTable);

export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;
