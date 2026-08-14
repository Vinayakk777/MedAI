import type { ConsultationState } from "./orchestrator";
import { getEffectiveDDx } from "./orchestrator";

export interface MedicalReport {
  reportId: string;
  version: number;
  generatedAt: string;
  consultationDate: string;

  patientInfo: {
    name?: string;
    age?: string;
    sex?: string;
    height?: string;
    weight?: string;
    bmi?: string;
    existingConditions: string[];
    allergies: string[];
    currentMedications: string[];
  };

  chiefComplaint: string;

  historyOfPresentIllness: {
    symptomTimeline: string;
    duration: string;
    severity: string;
    associatedSymptoms: string[];
    aggravatingFactors: string[];
    relievingFactors: string[];
  };

  extractedSymptoms: Array<{
    symptom: string;
    severity: string;
    duration: string;
    confidence: string;
    source: string;
  }>;

  differentialDiagnoses: Array<{
    condition: string;
    confidence: number;
    supportingFindings: string[];
    contradictoryFindings: string[];
    explanation: string;
  }>;

  clinicalReasoning: string;

  riskAssessment: {
    overallScore: number;
    riskCategory: string;
    emergencyFlags: string[];
    redFlagSymptoms: string[];
  };

  recommendedInvestigations: Array<{
    testName: string;
    reason: string;
    priority: string;
    category: string;
  }>;

  medicationSafety: {
    interactions: Array<{ description: string; severity: string }>;
    allergyWarnings: string[];
    contraindications: string[];
    otcGuidance: string[];
  };

  selfCareRecommendations: Array<{
    category: string;
    advice: string;
  }>;

  followUpPlan: {
    whenToMonitor: string;
    reviewTimeline: string;
    immediateAttentionRequired: string;
  };

  confidenceSummary: {
    overallConfidence: string;
    confidenceScore: number;
    missingInformation: string[];
    limitingFactors: string[];
  };

  disclaimer: string;
}

function confidenceLabel(label: string): number {
  const map: Record<string, number> = { high: 85, moderate: 60, low: 35 };
  return map[label.toLowerCase()] ?? 50;
}

export function generateReport(state: ConsultationState, conversationDate?: string): MedicalReport {
  const ddx = getEffectiveDDx(state);

  return {
    reportId: "",
    version: 1,
    generatedAt: new Date().toISOString(),
    consultationDate: conversationDate ?? new Date().toISOString(),

    patientInfo: {
      age: state.symptomAnalysis?.clinicalProfile.age,
      sex: state.symptomAnalysis?.clinicalProfile.gender,
      existingConditions: state.symptomAnalysis?.clinicalProfile.medicalHistory ?? [],
      allergies: [],
      currentMedications: state.symptomAnalysis?.clinicalProfile.currentMedications ?? [],
    },

    chiefComplaint: state.latestMessage,

    historyOfPresentIllness: {
      symptomTimeline: state.symptomAnalysis?.allSymptoms.map(s => `${s.normalized} (${s.duration})`).join("; ") ?? "",
      duration: state.symptomAnalysis?.primarySymptom?.duration ?? "",
      severity: state.symptomAnalysis?.primarySymptom?.severity ?? "",
      associatedSymptoms: state.symptomAnalysis?.secondarySymptoms.map(s => s.normalized) ?? [],
      aggravatingFactors: [],
      relievingFactors: [],
    },

    extractedSymptoms: state.symptomAnalysis?.allSymptoms.map(s => ({
      symptom: s.normalized,
      severity: s.severity ?? "moderate",
      duration: s.duration ?? "",
      confidence: "moderate",
      source: "symptom_analysis",
    })) ?? [],

    differentialDiagnoses: ddx?.conditions.map(c => ({
      condition: c.name,
      confidence: typeof c.confidence === "number" ? c.confidence : confidenceLabel(c.confidence),
      supportingFindings: c.supportingSymptoms ?? [],
      contradictoryFindings: [],
      explanation: "",
    })) ?? [],

    clinicalReasoning: "Clinical reasoning was performed based on symptom analysis, differential diagnosis, and available clinical data.",

    riskAssessment: {
      overallScore: state.healthRiskScore?.overallScore ?? 0,
      riskCategory: state.healthRiskScore?.riskCategory ?? "not_assessed",
      emergencyFlags: state.escalation?.redFlags.map(f => f.flag) ?? state.symptomAnalysis?.emergencyFlags ?? [],
      redFlagSymptoms: state.escalation?.redFlags.map(f => `${f.flag} (${f.category})`) ?? [],
    },

    recommendedInvestigations: state.laboratoryTests?.recommendedTests.map(t => ({
      testName: t.testName,
      reason: t.clinicalReason,
      priority: t.priority,
      category: t.category,
    })) ?? [],

    medicationSafety: {
      interactions: [],
      allergyWarnings: [],
      contraindications: [],
      otcGuidance: state.otcGuidance?.recommendations.map(r =>
        `${r.genericName}: ${r.purpose}. Dosage: ${r.adultDosage}. Precautions: ${r.precautions?.join("; ")}`
      ) ?? [],
    },

    selfCareRecommendations: state.selfCare?.recommendations.map(r => ({
      category: r.category,
      advice: r.recommendation,
    })) ?? [],

    followUpPlan: {
      whenToMonitor: state.recoveryPlan?.monitoringChecklist?.join("; ") ?? "Monitor symptoms as they develop.",
      reviewTimeline: Array.isArray(state.recoveryPlan?.followUpAdvice) && state.recoveryPlan.followUpAdvice.length > 0
        ? state.recoveryPlan.followUpAdvice.map(f => `${f.condition}: ${f.whenToSeekCare.join(", ")}`).join("; ")
        : "Follow up with a healthcare provider if symptoms persist beyond the expected duration.",
      immediateAttentionRequired: state.escalation?.recommendedAction ?? "Seek emergency care if symptoms worsen or new red flags appear.",
    },

    confidenceSummary: {
      overallConfidence: state.confidence?.overallConfidence ?? "not_assessed",
      confidenceScore: state.confidence?.confidenceScore ?? 0,
      missingInformation: state.symptomAnalysis?.missingInformation.map(m => m.detail) ?? state.confidence?.missingInformation ?? [],
      limitingFactors: state.confidence?.supportingFactors ?? [],
    },

    disclaimer: "This report is AI-generated for informational purposes only. It is not a diagnosis and must not replace consultation with a licensed healthcare professional.",
  };
}

export function generateReportSummary(report: MedicalReport): string {
  const parts: string[] = [];

  if (report.chiefComplaint) {
    parts.push(`Chief complaint: ${report.chiefComplaint}`);
  }

  if (report.differentialDiagnoses.length > 0) {
    const top = report.differentialDiagnoses.slice(0, 3);
    parts.push(`Primary considerations: ${top.map(d => `${d.condition} (${d.confidence}% confidence)`).join(", ")}`);
  }

  if (report.riskAssessment.overallScore > 0) {
    parts.push(`Risk score: ${report.riskAssessment.overallScore}/100 (${report.riskAssessment.riskCategory})`);
  }

  if (report.confidenceSummary.confidenceScore > 0) {
    parts.push(`AI confidence: ${report.confidenceSummary.confidenceScore}/100`);
  }

  parts.push(report.disclaimer);
  return parts.join("\n\n");
}
