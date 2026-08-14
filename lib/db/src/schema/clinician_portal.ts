import { pgTable, text, timestamp, uuid, integer, jsonb, real, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── 1. Clinician Profiles ───

export const clinicianProfilesTable = pgTable("clinician_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  role: text("role").notNull().default("doctor"), // patient | doctor | nurse | admin
  licenseNumber: text("license_number"),
  specialty: text("specialty"),
  department: text("department"),
  title: text("title"), // Dr., Prof., etc.
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  mfaEnabled: boolean("mfa_enabled").default(false),
  lastLoginAt: timestamp("last_login_at"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roleIdx: uniqueIndex("clinician_role_idx").on(table.role),
}));

// ─── 2. Patient Assignments ───

export const patientAssignmentsTable = pgTable("patient_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicianId: uuid("clinician_id").references(() => clinicianProfilesTable.id, { onDelete: "cascade" }),
  patientUserId: text("patient_user_id").notNull(),
  relationship: text("relationship").notNull().default("primary_care"), // primary_care | consulting | temporary | emergency
  isActive: boolean("is_active").default(true),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  unassignedAt: timestamp("unassigned_at"),
  notes: text("notes"),
});

// ─── 3. Physician Notes (SOAP) ───

export const physicianNotesTable = pgTable("physician_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: text("patient_user_id").notNull(),
  clinicianId: uuid("clinician_id").references(() => clinicianProfilesTable.id),
  consultationId: uuid("consultation_id"),
  version: integer("version").default(1),
  subjective: text("subjective"),
  objective: text("objective"),
  assessment: text("assessment"),
  plan: text("plan"),
  diagnosis: jsonb("diagnosis"),
  icdCodes: text("icd_codes").array(),
  isFinalized: boolean("is_finalized").default(false),
  finalizedAt: timestamp("finalized_at"),
  parentVersionId: uuid("parent_version_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  patientNoteIdx: uniqueIndex("patient_note_version_idx").on(table.patientUserId, table.consultationId, table.version),
}));

// ─── 4. AI Consultation Reviews ───

export const aiConsultationReviewsTable = pgTable("ai_consultation_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultationId: uuid("consultation_id").notNull(),
  patientUserId: text("patient_user_id").notNull(),
  clinicianId: uuid("clinician_id").references(() => clinicianProfilesTable.id),
  aiSummary: text("ai_summary"),
  aiDifferentialDiagnoses: jsonb("ai_differential_diagnoses"),
  aiConfidenceScore: real("ai_confidence_score"),
  aiRecommendations: jsonb("ai_recommendations"),
  reviewStatus: text("review_status").default("pending"), // pending | reviewed | accepted | rejected | modified
  clinicianDecision: text("clinician_decision"), // accepted | rejected | modified
  clinicianNotes: text("clinician_notes"),
  corrections: jsonb("corrections"),
  finalDiagnosis: text("final_diagnosis"),
  finalDiagnosisIcd: text("final_diagnosis_icd"),
  isReviewed: boolean("is_reviewed").default(false),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 5. Care Plans ───

export const carePlansTable = pgTable("care_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: text("patient_user_id").notNull(),
  clinicianId: uuid("clinician_id").references(() => clinicianProfilesTable.id),
  title: text("title").notNull(),
  description: text("description"),
  goals: jsonb("goals"),
  interventions: jsonb("interventions"),
  medications: jsonb("medications"),
  followUpSchedule: jsonb("follow_up_schedule"),
  status: text("status").default("active"), // active | completed | cancelled
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 6. Follow-Up Tasks ───

export const followUpTasksTable = pgTable("follow_up_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: text("patient_user_id").notNull(),
  clinicianId: uuid("clinician_id").references(() => clinicianProfilesTable.id),
  carePlanId: uuid("care_plan_id").references(() => carePlansTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").default("medium"), // low | medium | high | urgent
  status: text("status").default("pending"), // pending | in_progress | completed | cancelled
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  assignedTo: uuid("assigned_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 7. Referrals ───

export const clinReferralsTable = pgTable("clinician_referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: text("patient_user_id").notNull(),
  referringClinicianId: uuid("referring_clinician_id").references(() => clinicianProfilesTable.id),
  specialistClinicianId: uuid("specialist_clinician_id"),
  specialty: text("specialty").notNull(),
  reason: text("reason").notNull(),
  urgency: text("urgency").default("routine"), // routine | urgent | emergency
  status: text("status").default("pending"), // pending | accepted | declined | completed
  notes: text("notes"),
  responseNotes: text("response_notes"),
  respondedAt: timestamp("responded_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 8. FHIR Mappings (vendor-agnostic) ───

export const fhirMappingsTable = pgTable("fhir_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  resourceType: text("resource_type").notNull(), // Patient | Observation | Encounter | Condition | MedicationRequest | AllergyIntolerance | DiagnosticReport | CarePlan
  sourceField: text("source_field").notNull(),
  fhirPath: text("fhir_path").notNull(),
  transform: text("transform"), // direct | date_format | code_mapping | value_quantity
  vendor: text("vendor").default("generic"), // epic | cerner | athena | generic
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 9. FHIR Export Queue ───

export const fhirExportQueueTable = pgTable("fhir_export_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: text("patient_user_id").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceData: jsonb("resource_data").notNull(),
  status: text("status").default("pending"), // pending | processing | completed | failed
  vendor: text("vendor"),
  fhirVersion: text("fhir_version").default("R4"),
  errorMessage: text("error_message"),
  exportedAt: timestamp("exported_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 10. Consent Records ───

export const consentRecordsTable = pgTable("consent_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientUserId: text("patient_user_id").notNull(),
  consentType: text("consent_type").notNull(), // treatment | research | data_sharing | fhir_export | telemedicine
  status: text("status").default("granted"), // granted | revoked | expired
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  expiresAt: timestamp("expires_at"),
  grantedBy: text("granted_by"), // patient_user_id or clinician_id
  metadata: jsonb("metadata").default({}),
});

// ─── 11. Audit Logs (immutable) ───

export const clinicianAuditLogsTable = pgTable("clinician_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicianId: uuid("clinician_id"),
  patientUserId: text("patient_user_id"),
  action: text("action").notNull(), // view_record | modify_note | review_consultation | accept_diagnosis | reject_diagnosis | create_referral | export_fhir | view_audit
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 12. Alert Center ───

export const alertCenterTable = pgTable("alert_center", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicianId: uuid("clinician_id").references(() => clinicianProfilesTable.id),
  patientUserId: text("patient_user_id"),
  type: text("type").notNull(), // high_risk | escalation | medication_alert | abnormal_lab | follow_up_due | new_consultation
  severity: text("severity").default("info"), // critical | high | medium | low | info
  title: text("title").notNull(),
  message: text("message"),
  isRead: boolean("is_read").default(false),
  isResolved: boolean("is_resolved").default(false),
  actionUrl: text("action_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 13. EHR Connection Config ───

export const ehrConnectionsTable = pgTable("ehr_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicianId: uuid("clinician_id").references(() => clinicianProfilesTable.id),
  vendor: text("vendor").notNull(), // epic | cerner | athena | custom
  fhirBaseUrl: text("fhir_base_url"),
  apiKey: text("api_key"),
  clientId: text("client_id"),
  isActive: boolean("is_active").default(false),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Zod Schemas ───

export const insertPhysicianNoteSchema = createInsertSchema(physicianNotesTable).omit({ id: true, version: true, parentVersionId: true, createdAt: true, updatedAt: true });
export const insertAiReviewSchema = createInsertSchema(aiConsultationReviewsTable).omit({ id: true, createdAt: true });
export const insertCarePlanSchema = createInsertSchema(carePlansTable).omit({ id: true, createdAt: true });
export const insertFollowUpTaskSchema = createInsertSchema(followUpTasksTable).omit({ id: true, createdAt: true });
export const insertClinReferralSchema = createInsertSchema(clinReferralsTable).omit({ id: true, createdAt: true });
export const insertConsentSchema = createInsertSchema(consentRecordsTable).omit({ id: true, grantedAt: true });
export const insertClinAuditLogSchema = createInsertSchema(clinicianAuditLogsTable).omit({ id: true, createdAt: true });

// ─── Types ───

export type ClinicianProfile = typeof clinicianProfilesTable.$inferSelect;
export type PhysicianNote = typeof physicianNotesTable.$inferSelect;
export type AiConsultationReview = typeof aiConsultationReviewsTable.$inferSelect;
export type CarePlan = typeof carePlansTable.$inferSelect;
export type FollowUpTask = typeof followUpTasksTable.$inferSelect;
export type ClinReferral = typeof clinReferralsTable.$inferSelect;
export type ConsentRecord = typeof consentRecordsTable.$inferSelect;
export type AlertCenterEntry = typeof alertCenterTable.$inferSelect;
