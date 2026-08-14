import { pgTable, text, timestamp, uuid, jsonb, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const DOCUMENT_TYPES = [
  "lab_report", "blood_test", "urine_report", "discharge_summary",
  "prescription", "referral_letter", "vaccination_record",
  "medical_certificate", "operation_note", "clinical_progress_note",
  "chest_xray", "dental_xray", "skin_photograph", "eye_photograph",
  "wound_image", "ultrasound_report", "ecg_printout",
  "ct_report", "mri_report", "dicom", "other",
] as const;

export const DOCUMENT_STATUSES = [
  "uploading", "uploaded", "ocr_pending", "ocr_processing",
  "ocr_completed", "ocr_failed", "analyzing", "analyzed",
  "failed", "archived",
] as const;

export const LAB_CLASSIFICATIONS = [
  "normal", "borderline", "high", "low", "critical_high", "critical_low",
] as const;

export const IMAGE_FINDING_CATEGORIES = [
  "quality_issue", "completeness_issue", "abnormality_detected",
  "normal_appearance", "artifact", "incidental_finding",
] as const;

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

// ─── Medical Documents ───

export const docUploadsTable = pgTable("medical_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  documentType: text("document_type").notNull().default("other"),
  status: text("status").notNull().default("uploading"),
  fileName: text("file_name").notNull(),
  fileSize: real("file_size"),
  mimeType: text("mime_type"),
  storagePath: text("storage_path"),
  encryptedPath: text("encrypted_path"),
  encryptionIv: text("encryption_iv"),
  fileHash: text("file_hash"),
  pageCount: real("page_count"),
  title: text("title"),
  description: text("description"),
  reportDate: timestamp("report_date"),
  patientName: text("patient_name"),
  physicianName: text("physician_name"),
  hospitalName: text("hospital_name"),
  ocrStatus: text("ocr_status").default("pending"),
  ocrConfidence: real("ocr_confidence"),
  aiSummary: text("ai_summary"),
  isArchived: boolean("is_archived").default(false),
  version: real("version").default(1),
  metadata: jsonb("metadata").default({}),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const insertDocUploadSchema = createInsertSchema(docUploadsTable).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
});
export const selectDocUploadSchema = createSelectSchema(docUploadsTable);

// ─── OCR Results ───

export const docOcrResultsTable = pgTable("document_ocr_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => docUploadsTable.id, { onDelete: "cascade" }),
  rawText: text("raw_text"),
  processedText: text("processed_text"),
  confidence: real("confidence"),
  engine: text("engine").default("tesseract"),
  processingTimeMs: real("processing_time_ms"),
  extractedFields: jsonb("extracted_fields").default({}),
  patientName: text("patient_name"),
  reportDate: timestamp("report_date"),
  physicianName: text("physician_name"),
  hospitalName: text("hospital_name"),
  isVerified: boolean("is_verified").default(false),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocOcrResultSchema = createInsertSchema(docOcrResultsTable).omit({
  id: true, createdAt: true,
});
export const selectDocOcrResultSchema = createSelectSchema(docOcrResultsTable);

// ─── Extracted Lab Values ───

export const docLabValuesTable = pgTable("extracted_lab_values", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => docUploadsTable.id, { onDelete: "cascade" }),
  testName: text("test_name").notNull(),
  testCategory: text("test_category"),
  value: text("value").notNull(),
  unit: text("unit"),
  referenceRange: text("reference_range"),
  referenceLow: real("reference_low"),
  referenceHigh: real("reference_high"),
  classification: text("classification").default("normal"),
  isAbnormal: boolean("is_abnormal").default(false),
  confidence: real("confidence"),
  sourceLocation: text("source_location"),
  explanation: text("explanation"),
  patientExplanation: text("patient_explanation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocLabValueSchema = createInsertSchema(docLabValuesTable).omit({
  id: true, createdAt: true,
});
export const selectDocLabValueSchema = createSelectSchema(docLabValuesTable);

// ─── Extracted Medications ───

export const docMedicationsTable = pgTable("extracted_medications", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => docUploadsTable.id, { onDelete: "cascade" }),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage"),
  dosageValue: real("dosage_value"),
  dosageUnit: text("dosage_unit"),
  frequency: text("frequency"),
  route: text("route"),
  duration: text("duration"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  specialInstructions: text("special_instructions"),
  isDuplicate: boolean("is_duplicate").default(false),
  duplicateOfId: uuid("duplicate_of_id"),
  hasInteraction: boolean("has_interaction").default(false),
  interactionDescription: text("interaction_description"),
  allergyConflict: boolean("allergy_conflict").default(false),
  allergyDescription: text("allergy_description"),
  missingDosage: boolean("missing_dosage").default(false),
  confidence: real("confidence"),
  sourceLocation: text("source_location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocMedicationSchema = createInsertSchema(docMedicationsTable).omit({
  id: true, createdAt: true,
});
export const selectDocMedicationSchema = createSelectSchema(docMedicationsTable);

// ─── Image Analyses ───

export const docImageAnalysesTable = pgTable("image_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => docUploadsTable.id, { onDelete: "cascade" }),
  imageType: text("image_type").notNull(),
  qualityScore: real("quality_score"),
  completenessScore: real("completeness_score"),
  findings: jsonb("findings").default([]),
  observations: jsonb("observations").default([]),
  limitations: jsonb("limitations").default([]),
  overallConfidence: real("overall_confidence"),
  processingTimeMs: real("processing_time_ms"),
  modelVersion: text("model_version"),
  isInformationalOnly: boolean("is_informational_only").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocImageAnalysisSchema = createInsertSchema(docImageAnalysesTable).omit({
  id: true, createdAt: true,
});
export const selectDocImageAnalysisSchema = createSelectSchema(docImageAnalysesTable);

// ─── Trend Comparisons ───

export const docTrendComparisonsTable = pgTable("document_trend_comparisons", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  documentId: uuid("document_id").notNull().references(() => docUploadsTable.id, { onDelete: "cascade" }),
  previousDocumentId: uuid("previous_document_id").references(() => docUploadsTable.id),
  testName: text("test_name").notNull(),
  currentValue: text("current_value"),
  previousValue: text("previous_value"),
  currentClassification: text("current_classification"),
  previousClassification: text("previous_classification"),
  trend: text("trend").default("stable"),
  unit: text("unit"),
  absoluteChange: real("absolute_change"),
  percentChange: real("percent_change"),
  isSignificant: boolean("is_significant").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocTrendComparisonSchema = createInsertSchema(docTrendComparisonsTable).omit({
  id: true, createdAt: true,
});
export const selectDocTrendComparisonSchema = createSelectSchema(docTrendComparisonsTable);

// ─── Clinical Summaries ───

export const docClinicalSummariesTable = pgTable("clinical_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  documentIds: text("document_ids").array(),
  physicianSummary: text("physician_summary"),
  patientSummary: text("patient_summary"),
  keyFindings: jsonb("key_findings").default([]),
  recommendations: jsonb("recommendations").default([]),
  medicationSummary: jsonb("medication_summary").default({}),
  labTrendSummary: text("lab_trend_summary"),
  createdFrom: text("created_from").default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocClinicalSummarySchema = createInsertSchema(docClinicalSummariesTable).omit({
  id: true, createdAt: true,
});
export const selectDocClinicalSummarySchema = createSelectSchema(docClinicalSummariesTable);

// ─── Types ───

export type DocUpload = typeof docUploadsTable.$inferSelect;
export type InsertDocUpload = z.infer<typeof insertDocUploadSchema>;
export type DocOcrResult = typeof docOcrResultsTable.$inferSelect;
export type InsertDocOcrResult = z.infer<typeof insertDocOcrResultSchema>;
export type DocLabValue = typeof docLabValuesTable.$inferSelect;
export type InsertDocLabValue = z.infer<typeof insertDocLabValueSchema>;
export type DocMedication = typeof docMedicationsTable.$inferSelect;
export type InsertDocMedication = z.infer<typeof insertDocMedicationSchema>;
export type DocImageAnalysis = typeof docImageAnalysesTable.$inferSelect;
export type InsertDocImageAnalysis = z.infer<typeof insertDocImageAnalysisSchema>;
export type DocTrendComparison = typeof docTrendComparisonsTable.$inferSelect;
export type InsertDocTrendComparison = z.infer<typeof insertDocTrendComparisonSchema>;
export type DocClinicalSummary = typeof docClinicalSummariesTable.$inferSelect;
export type InsertDocClinicalSummary = z.infer<typeof insertDocClinicalSummarySchema>;
