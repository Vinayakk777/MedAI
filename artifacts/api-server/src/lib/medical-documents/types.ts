export type DocumentType =
  | "lab_report" | "blood_test" | "urine_report" | "discharge_summary"
  | "prescription" | "referral_letter" | "vaccination_record"
  | "medical_certificate" | "operation_note" | "clinical_progress_note"
  | "chest_xray" | "dental_xray" | "skin_photograph" | "eye_photograph"
  | "wound_image" | "ultrasound_report" | "ecg_printout"
  | "ct_report" | "mri_report" | "dicom" | "other";

export type DocumentStatus =
  | "uploading" | "uploaded" | "ocr_pending" | "ocr_processing"
  | "ocr_completed" | "ocr_failed" | "analyzing" | "analyzed"
  | "failed" | "archived";

export type LabClassification =
  | "normal" | "borderline" | "high" | "low" | "critical_high" | "critical_low";

export type ConfidenceLevel = "high" | "medium" | "low";

export type TrendDirection = "improving" | "worsening" | "stable" | "newly_abnormal" | "resolved";

export interface UploadRequest {
  documentType: DocumentType;
  title?: string;
  description?: string;
  tags?: string[];
  conversationId?: string;
}

export interface UploadResult {
  documentId: string;
  fileName: string;
  status: DocumentStatus;
  storagePath: string;
}

export interface OcrField {
  name: string;
  value: string;
  confidence: number;
  sourceLocation?: string;
}

export interface OcrResult {
  documentId: string;
  rawText: string;
  processedText: string;
  confidence: number;
  engine: string;
  processingTimeMs: number;
  extractedFields: Record<string, string>;
  patientName?: string;
  reportDate?: string;
  physicianName?: string;
  hospitalName?: string;
}

export interface LabValue {
  id?: string;
  testName: string;
  testCategory?: string;
  value: string;
  numericValue?: number;
  unit?: string;
  referenceRange?: string;
  referenceLow?: number;
  referenceHigh?: number;
  classification: LabClassification;
  isAbnormal: boolean;
  confidence: number;
  sourceLocation?: string;
  explanation?: string;
  patientExplanation?: string;
}

export interface Medication {
  id?: string;
  medicationName: string;
  dosage?: string;
  dosageValue?: number;
  dosageUnit?: string;
  frequency?: string;
  route?: string;
  duration?: string;
  startDate?: string;
  endDate?: string;
  specialInstructions?: string;
  isDuplicate: boolean;
  duplicateOfId?: string;
  hasInteraction: boolean;
  interactionDescription?: string;
  allergyConflict: boolean;
  allergyDescription?: string;
  missingDosage: boolean;
  confidence: number;
  sourceLocation?: string;
}

export interface MedicationIssue {
  type: "duplicate" | "interaction" | "allergy" | "missing_dosage" | "expired";
  severity: "high" | "medium" | "low";
  description: string;
  medicationName: string;
  relatedMedicationName?: string;
}

export interface ImageAnalysisFinding {
  category: string;
  observation: string;
  confidence: number;
  location?: string;
  isCritical: boolean;
}

export interface ImageAnalysisResult {
  documentId: string;
  imageType: string;
  qualityScore: number;
  completenessScore: number;
  findings: ImageAnalysisFinding[];
  observations: string[];
  limitations: string[];
  overallConfidence: number;
  processingTimeMs: number;
  isInformationalOnly: boolean;
}

export interface TrendPoint {
  date: string;
  value: number;
  classification: LabClassification;
  documentId: string;
}

export interface TrendComparison {
  testName: string;
  currentValue: string;
  previousValue: string;
  currentClassification: LabClassification;
  previousClassification: LabClassification;
  trend: TrendDirection;
  unit?: string;
  absoluteChange?: number;
  percentChange?: number;
  isSignificant: boolean;
  trendPoints?: TrendPoint[];
}

export interface TrendSummary {
  comparisons: TrendComparison[];
  improvingCount: number;
  worseningCount: number;
  stableCount: number;
  newlyAbnormalCount: number;
  summary: string;
}

export interface ClinicalSummary {
  id?: string;
  physicianSummary: string;
  patientSummary: string;
  keyFindings: string[];
  recommendations: string[];
  medicationSummary: {
    active: number;
    changes: number;
    issues: number;
    details: string;
  };
  labTrendSummary?: string;
}

export interface DocumentSearchParams {
  query?: string;
  documentType?: DocumentType;
  status?: DocumentStatus;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  isArchived?: boolean;
  sortBy?: "date" | "type" | "name" | "status";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface DocumentSearchResult {
  documents: any[];
  total: number;
  limit: number;
  offset: number;
}
