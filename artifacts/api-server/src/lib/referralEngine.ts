import type { ConsultationState } from "./orchestrator";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { ConfidenceAssessment } from "./confidenceEngine";
import type { EscalationResult } from "./escalationEngine";
import type { HealthRiskScore } from "./riskEngine";
import type { LabRecommendationResult } from "./labEngine";
import type { MedicalMemory } from "@workspace/db";
import { getEffectiveDDx } from "./orchestrator";
import { getRelevantMemories } from "./memoryEngine";

// ─── Care Levels ───

export type CareLevel = "self_care" | "pcp" | "urgent_care" | "emergency_today" | "emergency_now";

export interface ReferralDecision {
  careLevel: CareLevel;
  urgencyLabel: string;
  reason: string;
  estimatedSeekTime: string;
  preparationInstructions: string[];
  whatToBring: string[];
  whatToTellDoctor: string[];
}

// ─── Classification Rules (deterministic, no AI call needed) ───

const CARE_LEVEL_MAP: Record<CareLevel, { label: string; emoji: string; seekTime: string }> = {
  self_care:         { label: "Self-Care at Home",              emoji: "🟢", seekTime: "Not needed — monitor at home" },
  pcp:               { label: "Primary Care Physician",         emoji: "🔵", seekTime: "Within 24–72 hours" },
  urgent_care:       { label: "Urgent Care Clinic",             emoji: "🟠", seekTime: "Today — within a few hours" },
  emergency_today:   { label: "Emergency Department (Today)",   emoji: "🔴", seekTime: "Immediately — go now" },
  emergency_now:     { label: "Call Emergency Services Now",    emoji: "🔴", seekTime: "Call 108 or local emergency number NOW" },
};

const PREP_INSTRUCTIONS: Record<CareLevel, string[]> = {
  self_care: [
    "Rest and stay hydrated",
    "Monitor your symptoms and note any changes",
    "Follow the self-care plan provided in the consultation",
  ],
  pcp: [
    "Call your doctor's office to schedule an appointment",
    "Mention your symptoms and how long you've had them",
    "Ask if any tests should be done before the visit",
  ],
  urgent_care: [
    "Find your nearest urgent care clinic",
    "Call ahead to check wait times if possible",
    "Bring a list of your current medications and allergies",
    "Avoid eating or drinking if instructed",
  ],
  emergency_today: [
    "Go to the nearest emergency department now",
    "Do not drive yourself if you feel unsafe — ask someone to drive you",
    "If symptoms worsen on the way, call 108",
    "Bring your ID, insurance card, and medication list",
  ],
  emergency_now: [
    "Call 108 or your local emergency number immediately",
    "Do NOT attempt to drive yourself to the hospital",
    "Unlock your front door so emergency personnel can enter",
    "Stay on the line with the dispatcher until help arrives",
  ],
};

const WHAT_TO_BRING: Record<CareLevel, string[]> = {
  self_care: [],
  pcp: [
    "List of current medications and dosages",
    "List of allergies",
    "Previous lab results or medical records if available",
    "Health insurance card and ID",
  ],
  urgent_care: [
    "Photo ID and insurance card",
    "List of current medications and dosages",
    "List of allergies (especially medication allergies)",
    "Previous relevant lab or imaging reports",
  ],
  emergency_today: [
    "Photo ID and insurance card",
    "List of current medications (or bring the bottles)",
    "List of allergies",
    "Emergency contact name and phone number",
    "Any previous medical records relevant to current symptoms",
  ],
  emergency_now: [
    "Emergency services will handle documentation — focus on staying safe",
  ],
};

const WHAT_TO_TELL: Record<CareLevel, string[]> = {
  self_care: [],
  pcp: [
    "Describe when symptoms started and how they've changed",
    "Mention any treatments you've already tried",
    "Tell them about any recent travel or exposures",
    "Mention any chronic conditions you have",
    "Mention any previous similar episodes",
  ],
  urgent_care: [
    "When did the symptoms start and how have they progressed?",
    "What makes symptoms better or worse?",
    "What medications have you already tried?",
    "Do you have any allergies (especially to medications)?",
    "Have you had any recent injuries, falls, or exposures?",
    "Mention any chronic conditions (diabetes, asthma, etc.)",
  ],
  emergency_today: [
    "Tell them when the symptoms started and how quickly they worsened",
    "Mention the most severe symptom first",
    "List all medications you take, including over-the-counter and supplements",
    "Mention all allergies, especially to medications or latex",
    "Tell them about any relevant medical history (surgery, chronic illness)",
    "Mention if you are pregnant or could be pregnant",
    "Tell them about any recent travel, falls, or injuries",
  ],
  emergency_now: [
    "Focus on the most critical symptom (e.g., chest pain, difficulty breathing)",
    "Tell the dispatcher if the person is unconscious, not breathing, or bleeding severely",
    "Provide your exact location and any access instructions",
    "Do not hang up until the dispatcher tells you to",
  ],
};

// ─── Main decision engine ───

export function classifyCareLevel(state: ConsultationState): ReferralDecision {
  const escalation = state.escalation;
  const riskScore = state.healthRiskScore;
  const ddx = getEffectiveDDx(state);
  const analysis = state.symptomAnalysis;
  const confidence = state.confidence;

  // Rule 1: Emergency NOW — life-threatening symptoms
  if (escalation?.escalationLevel === "emergency" && hasLifeThreateningSymptoms(analysis, escalation)) {
    return buildDecision("emergency_now", buildEmergencyNowReason(analysis, escalation, ddx));
  }

  // Rule 2: Emergency TODAY — severe but not immediately life-threatening
  if (escalation?.escalationLevel === "emergency" || riskScore?.riskCategory === "critical" || riskScore && riskScore.overallScore >= 81) {
    return buildDecision("emergency_today", buildEmergencyTodayReason(analysis, escalation, ddx, riskScore));
  }

  // Rule 3: Urgent Care — needs same-day evaluation
  if (escalation?.escalationLevel === "urgent_care" || riskScore?.riskCategory === "high" || (riskScore && riskScore.overallScore >= 61)) {
    return buildDecision("urgent_care", buildUrgentCareReason(analysis, escalation, ddx, riskScore));
  }

  // Rule 4: PCP — needs evaluation within days
  if (escalation?.escalationLevel === "medical_review" || riskScore?.riskCategory === "moderate" || (riskScore && riskScore.overallScore >= 41) || hasPersistentSymptoms(analysis)) {
    return buildDecision("pcp", buildPCPReason(analysis, escalation, ddx, riskScore));
  }

  // Rule 5: Self-care — routine, low risk
  return buildDecision("self_care", buildSelfCareReason(analysis, confidence, riskScore));
}

function hasLifeThreateningSymptoms(analysis: SymptomAnalysis | null, escalation: EscalationResult | null): boolean {
  const criticalFlags = escalation?.redFlags?.filter((f) =>
    ["cardiovascular", "neurological", "respiratory", "allergic", "mental_health"].includes(f.category),
  ) ?? [];
  return criticalFlags.length > 0;
}

function hasPersistentSymptoms(analysis: SymptomAnalysis | null): boolean {
  if (!analysis?.allSymptoms) return false;
  return analysis.allSymptoms.some((s) => {
    const dur = s.duration?.toLowerCase() ?? "";
    return dur.includes("week") || dur.includes("weeks") || dur.includes("month") || parseInt(dur) > 7;
  });
}

function buildDecision(careLevel: CareLevel, reason: string): ReferralDecision {
  const level = CARE_LEVEL_MAP[careLevel];
  return {
    careLevel,
    urgencyLabel: `${level.emoji} ${level.label}`,
    reason,
    estimatedSeekTime: level.seekTime,
    preparationInstructions: PREP_INSTRUCTIONS[careLevel],
    whatToBring: WHAT_TO_BRING[careLevel],
    whatToTellDoctor: WHAT_TO_TELL[careLevel],
  };
}

// ─── Reasoning builders ───

function buildEmergencyNowReason(
  analysis: SymptomAnalysis | null,
  escalation: EscalationResult | null,
  ddx: AssessmentResult | null,
): string {
  const flags = escalation?.redFlags?.map((f) => f.flag).join(", ") ?? "";
  const symptoms = analysis?.allSymptoms?.map((s) => `${s.normalized} (${s.severity})`).join(", ") ?? "";
  const topDx = ddx?.conditions?.[0]?.name ?? "";

  const parts: string[] = [];
  if (flags) parts.push(`Your symptoms include potentially life-threatening warning signs: ${flags}.`);
  if (symptoms) parts.push(`You are experiencing: ${symptoms}.`);
  if (topDx) parts.push(`This pattern raises concern for ${topDx}, which requires immediate emergency evaluation.`);
  parts.push("These symptoms require immediate emergency medical attention. Please call emergency services right away.");

  return parts.join(" ");
}

function buildEmergencyTodayReason(
  analysis: SymptomAnalysis | null,
  escalation: EscalationResult | null,
  ddx: AssessmentResult | null,
  riskScore: HealthRiskScore | null,
): string {
  const flags = escalation?.redFlags?.map((f) => f.flag).join(", ") ?? "";
  const score = riskScore?.overallScore;
  const category = riskScore?.riskCategory;
  const topDx = ddx?.conditions?.[0]?.name ?? "";

  const parts: string[] = [];
  if (score != null) parts.push(`Your health risk score is ${score}/100 (${category}), indicating a high-risk situation.`);
  if (flags) parts.push(`Warning signs detected: ${flags}.`);
  if (topDx) parts.push(`The clinical picture is concerning for ${topDx}.`);
  parts.push("You need to go to the Emergency Department today for evaluation. Do not wait to see if symptoms improve.");

  return parts.join(" ");
}

function buildUrgentCareReason(
  analysis: SymptomAnalysis | null,
  escalation: EscalationResult | null,
  ddx: AssessmentResult | null,
  riskScore: HealthRiskScore | null,
): string {
  const score = riskScore?.overallScore;
  const category = riskScore?.riskCategory;
  const flags = escalation?.redFlags?.map((f) => f.flag).join(", ") ?? "";
  const severeSymptoms = analysis?.allSymptoms?.filter((s) => s.severity === "severe" || s.severity === "moderate")?.map((s) => s.normalized).join(", ") ?? "";

  const parts: string[] = [];
  if (score != null) parts.push(`Your health risk score is ${score}/100 (${category}), which requires prompt medical evaluation.`);
  if (flags) parts.push(`The following concerns were identified: ${flags}.`);
  if (severeSymptoms) parts.push(`You are experiencing: ${severeSymptoms}.`);
  if (ddx?.conditions?.[0]) parts.push(`The assessment suggests ${ddx.conditions[0].name}, which may need same-day evaluation.`);
  parts.push("Please visit an urgent care clinic today for evaluation and treatment.");

  return parts.join(" ");
}

function buildPCPReason(
  analysis: SymptomAnalysis | null,
  escalation: EscalationResult | null,
  ddx: AssessmentResult | null,
  riskScore: HealthRiskScore | null,
): string {
  const score = riskScore?.overallScore;
  const category = riskScore?.riskCategory;
  const persistentSymptoms = analysis?.allSymptoms?.filter((s) => {
    const dur = s.duration?.toLowerCase() ?? "";
    return dur.includes("week") || dur.includes("month") || parseInt(dur) > 7;
  })?.map((s) => s.normalized).join(", ") ?? "";
  const topDx = ddx?.conditions?.[0]?.name ?? "";

  const parts: string[] = [];
  if (persistentSymptoms) parts.push(`Your symptoms have persisted: ${persistentSymptoms}.`);
  if (score != null) parts.push(`Your health risk score is ${score}/100 (${category}), indicating a need for professional evaluation.`);
  if (topDx) parts.push(`The assessment suggests ${topDx}.`);
  parts.push("Please schedule an appointment with your primary care physician within the next few days for a thorough evaluation.");

  return parts.join(" ");
}

function buildSelfCareReason(
  analysis: SymptomAnalysis | null,
  confidence: ConfidenceAssessment | null,
  riskScore: HealthRiskScore | null,
): string {
  const parts: string[] = [];
  parts.push("Based on a thorough analysis, your symptoms appear to be mild and self-limiting.");
  if (riskScore?.overallScore != null) {
    parts.push(`Your health risk score is ${riskScore.overallScore}/100 (${riskScore.riskCategory}), which is low.`);
  }
  if (confidence?.confidenceScore != null && confidence.confidenceScore >= 50) {
    parts.push("We have reasonably good confidence in this assessment.");
  }
  parts.push("No red flags or emergency warning signs were detected. You can safely manage your symptoms at home with self-care.");
  parts.push("However, if your symptoms worsen or new symptoms develop, please seek medical attention.");

  return parts.join(" ");
}

// ─── Handoff Summary generation ───

export interface DoctorHandoff {
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

export function generateHandoffSummary(
  state: ConsultationState,
  referral: ReferralDecision,
  priorMemories?: MedicalMemory[],
): DoctorHandoff {
  const ddx = getEffectiveDDx(state);
  const analysis = state.symptomAnalysis;
  const escalation = state.escalation;
  const riskScore = state.healthRiskScore;
  const clinicalSummary = state.clinicalSummary;

  const timeline = analysis?.allSymptoms
    ?.map((s) => `${s.normalized}: ${s.severity}, ${s.duration} (${s.progression ?? "stable"})`)
    .join("; ") ?? "";

  const redFlagFindings = [
    ...(escalation?.redFlags?.map((f) => `${f.flag} (${f.category})`) ?? []),
    ...(analysis?.emergencyFlags ?? []),
  ];

  const vitalSigns = (state as any).vitals ?? {};

  return {
    patientInfo: {
      age: analysis?.clinicalProfile?.age,
      sex: analysis?.clinicalProfile?.gender,
      height: vitalSigns.height ?? undefined,
      weight: vitalSigns.weight ?? undefined,
      bmi: vitalSigns.bmi ?? undefined,
    },
    chiefComplaint: state.latestMessage?.slice(0, 500) ?? "Not specified",
    historyOfPresentIllness: {
      timeline,
      duration: analysis?.primarySymptom?.duration ?? "Not specified",
      severity: analysis?.primarySymptom?.severity ?? "Not specified",
      progression: analysis?.allSymptoms?.[0]?.progression ?? "Not specified",
    },
    relevantMedicalHistory: analysis?.clinicalProfile?.medicalHistory ?? [],
    currentMedications: analysis?.clinicalProfile?.currentMedications ?? [],
    allergies: [],
    vitalSigns: {
      heartRate: vitalSigns.heartRate ?? null,
      systolic: vitalSigns.systolic ?? null,
      diastolic: vitalSigns.diastolic ?? null,
      temperature: vitalSigns.temperature ?? null,
      oxygenSaturation: vitalSigns.oxygenSaturation ?? null,
      respiratoryRate: vitalSigns.respiratoryRate ?? null,
      bloodGlucose: vitalSigns.bloodGlucose ?? null,
      painScore: vitalSigns.painScore ?? null,
    },
    differentialDiagnoses: (ddx?.conditions ?? []).map((c) => ({
      condition: c.name,
      confidence: String(c.confidence),
      supportingSymptoms: c.supportingSymptoms ?? [],
    })),
    riskAssessment: {
      overallScore: riskScore?.overallScore ?? null,
      riskCategory: riskScore?.riskCategory ?? null,
      emergencyFlags: analysis?.emergencyFlags ?? [],
      redFlags: escalation?.redFlags ?? [],
    },
    recommendedInvestigations: (state.laboratoryTests?.recommendedTests ?? []).map((t) => ({
      testName: t.testName,
      reason: t.clinicalReason,
      priority: t.priority,
    })),
    redFlagFindings,
    aiClinicalSummary: clinicalSummary?.consultationSummary ?? "AI assessment summary not available.",
    followUpAlreadyAttempted: clinicalSummary?.assessmentQuality?.followUpCompletion
      ? [`Follow-up completion rated: ${clinicalSummary.assessmentQuality.followUpCompletion}`]
      : [],
    outstandingQuestions: clinicalSummary?.keyFindings?.missingInformation ?? [],
    previousConsultations: (priorMemories ?? []).slice(0, 5).map((m) => ({
      date: m.consultationDate.toISOString(),
      chiefComplaint: m.chiefComplaint,
      outcome: m.outcome,
    })),
    disclaimer: "This handoff summary is AI-generated based on the patient's self-reported symptoms and consultation data. It is intended to assist healthcare professionals and should not replace a comprehensive medical evaluation. All clinical decisions remain the responsibility of the licensed healthcare provider.",
    generatedAt: new Date().toISOString(),
  };
}
