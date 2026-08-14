export type UserRole = "patient" | "doctor" | "nurse" | "admin";

export interface ClinicianProfileData {
  userId: string;
  role: UserRole;
  licenseNumber?: string;
  specialty?: string;
  department?: string;
  title?: string;
  fullName: string;
  email?: string;
  phone?: string;
}

export interface PatientAssignmentData {
  clinicianId: string;
  patientUserId: string;
  relationship: "primary_care" | "consulting" | "temporary" | "emergency";
  notes?: string;
}

// ─── SOAP Note ───

export interface SOAPNoteInput {
  patientUserId: string;
  consultationId?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosis?: Record<string, unknown>;
  icdCodes?: string[];
}

export interface SOAPNote extends SOAPNoteInput {
  id: string;
  clinicianId: string;
  version: number;
  isFinalized: boolean;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── AI Review ───

export interface AIReviewInput {
  consultationId: string;
  patientUserId: string;
  aiSummary: string;
  aiDifferentialDiagnoses: Record<string, unknown>;
  aiConfidenceScore: number;
  aiRecommendations: Record<string, unknown>;
}

export interface ClinicianReviewAction {
  reviewStatus: "reviewed" | "accepted" | "rejected" | "modified";
  clinicianNotes?: string;
  corrections?: Record<string, unknown>;
  finalDiagnosis?: string;
  finalDiagnosisIcd?: string;
}

// ─── Care Plan ───

export interface CarePlanInput {
  patientUserId: string;
  title: string;
  description?: string;
  goals?: Record<string, unknown>;
  interventions?: Record<string, unknown>;
  medications?: Record<string, unknown>;
  followUpSchedule?: Record<string, unknown>;
}

// ─── FHIR ───

export type FHIRResourceType =
  | "Patient"
  | "Observation"
  | "Encounter"
  | "Condition"
  | "MedicationRequest"
  | "AllergyIntolerance"
  | "DiagnosticReport"
  | "CarePlan";

export interface FHIRMappingConfig {
  resourceType: FHIRResourceType;
  sourceField: string;
  fhirPath: string;
  transform: "direct" | "date_format" | "code_mapping" | "value_quantity";
  vendor: string;
}

export interface FHIRResource {
  resourceType: FHIRResourceType;
  id?: string;
  [key: string]: unknown;
}

// ─── Consent ───

export interface ConsentInput {
  patientUserId: string;
  consentType: "treatment" | "research" | "data_sharing" | "fhir_export" | "telemedicine";
  status: "granted" | "revoked" | "expired";
  expiresAt?: Date;
  grantedBy?: string;
  metadata?: Record<string, unknown>;
}

// ─── Alert ───

export interface AlertInput {
  clinicianId: string;
  patientUserId?: string;
  type: "high_risk" | "escalation" | "medication_alert" | "abnormal_lab" | "follow_up_due" | "new_consultation";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  message?: string;
  actionUrl?: string;
}

// ─── Dashboard ───

export interface ClinicianDashboardData {
  todayPatients: number;
  pendingConsultations: number;
  highRiskPatients: number;
  emergencyEscalations: number;
  followUpAppointments: number;
  recentReports: number;
  labRecommendations: number;
  medicationAlerts: number;
  recentPatients: Array<{
    userId: string;
    fullName: string;
    lastConsultation: Date;
    riskCategory: string;
    hasUnreviewedConsultation: boolean;
  }>;
}

// ─── Medical Record ───

export interface MedicalRecordSummary {
  patientUserId: string;
  consultations: Array<{
    id: string;
    date: Date;
    chiefComplaint: string;
    riskCategory: string;
    aiReviewed: boolean;
    clinicianNotes: number;
  }>;
  diagnoses: Array<{
    diagnosis: string;
    icdCode?: string;
    date: Date;
    clinician: string;
  }>;
  medications: Array<{
    name: string;
    dosage: string;
    startDate: Date;
    endDate?: Date;
    prescribedBy: string;
  }>;
  allergies: Array<{
    allergen: string;
    reaction: string;
    severity: string;
  }>;
  vitals: Array<{
    type: string;
    value: string;
    date: Date;
  }>;
  labs: Array<{
    test: string;
    result: string;
    date: Date;
    isAbnormal: boolean;
  }>;
  carePlans: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: Date;
  }>;
}

// ─── Audit ───

export interface AuditEventInput {
  clinicianId?: string;
  patientUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}
