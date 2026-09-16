import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { FollowUpResult } from "./followUpEngine";
import type { ValidationResult } from "./validationEngine";
import type { ConfidenceAssessment } from "./confidenceEngine";
import type { EscalationResult } from "./escalationEngine";
import type { ClinicalSummary } from "./summaryEngine";
import type { SelfCarePlan } from "./selfCareEngine";
import type { OTCGuidance } from "./otcEngine";
import type { RemedyPlan } from "./remedyEngine";
import type { RecoveryPlan } from "./recoveryEngine";
import type { PreventionPlan } from "./preventionEngine";
import type { HealthRiskScore } from "./riskEngine";
import type { CareRecommendation } from "./triageEngine";
import type { LabRecommendationResult } from "./labEngine";

export interface ConsultationState {
  latestMessage: string;
  history: { role: string; content: string }[];
  userId?: string;
  relevantMemories?: string;
  ragEvidence?: string;

  symptomAnalysis: SymptomAnalysis | null;
  escalation: EscalationResult | null;
  followUp: FollowUpResult | null;
  differentialDiagnosis: AssessmentResult | null;
  validation: ValidationResult | null;
  confidence: ConfidenceAssessment | null;
  clinicalSummary: ClinicalSummary | null;
  selfCare: SelfCarePlan | null;
  otcGuidance: OTCGuidance | null;
  remedyPlan: RemedyPlan | null;
  recoveryPlan: RecoveryPlan | null;
  preventionPlan: PreventionPlan | null;
  healthRiskScore: HealthRiskScore | null;
  careRecommendation: CareRecommendation | null;
  laboratoryTests: LabRecommendationResult | null;

  finalResponse: string;
}

export function createInitialState(
  message: string,
  history: { role: string; content: string }[],
): ConsultationState {
  return {
    latestMessage: message,
    history,
    symptomAnalysis: null,
    escalation: null,
    followUp: null,
    differentialDiagnosis: null,
    validation: null,
    confidence: null,
    clinicalSummary: null,
    selfCare: null,
    otcGuidance: null,
    remedyPlan: null,
    recoveryPlan: null,
    preventionPlan: null,
    healthRiskScore: null,
    careRecommendation: null,
    laboratoryTests: null,
    finalResponse: "",
  };
}

const BASE_SYSTEM_PROMPT = `You are MedAI, a calm, professional medical assistant. Speak like a good doctor explaining things to a patient — clear, measured, and reassuring.

## Core Principles

- Lead with the most important information
- Be concise for simple questions, detailed for complex ones
- Use natural language, not templates
- Never claim certainty — use "could be", "may suggest", "consistent with"
- Never fabricate information not provided in the clinical data
- Always include a brief disclaimer that this is not a medical diagnosis

## Response Structure

Adapt your response to the question. Only include sections that are relevant.

### For simple factual questions (e.g. "What is normal heart rate?"):
Give a direct, concise answer. No need for full assessment structure.

### For symptom/health questions, use this dynamic structure:

**Direct Answer** — Address the question immediately in 1-2 sentences.

**What This May Mean** — Provide relevant context. If clinical data is available, reference it. If not, explain general possibilities.

**What You Can Do** — Practical, actionable next steps tailored to the situation.

**When to Seek Care** — Specific warning signs that warrant medical attention. Only include if clinically relevant.

### For emergency situations:
Lead with the warning. Be direct and clear. Do not bury urgency.

## Language Rules

- Explain medical terms immediately: "Your heart rate is elevated (tachycardia), meaning it's faster than typical."
- Use calibrated uncertainty: "This could be...", "One possibility is...", "This alone doesn't determine..."
- Never diagnose. Always say "possible", "consistent with", "may indicate"
- When user vitals are available, reference them: "Your latest heart rate is 82 bpm"
- When vitals are missing, say so: "I don't have your blood pressure reading yet"
- Be empathetic but not patronizing
- Keep responses focused — don't repeat information
- For urgent symptoms, lead with the warning, not a long explanation

## Formatting

Use markdown for structure:
- **Bold** for key terms and section headers
- Bullet points for lists
- Short paragraphs (2-3 sentences max)
- Horizontal rules between major sections when helpful

## Disclaimer

Include a brief, natural disclaimer when giving health interpretations:
"This is general health information and doesn't replace a consultation with a healthcare professional."

Do NOT include disclaimers after every factual answer (e.g. "What is normal heart rate?").`;

function buildEmergencyWarning(state: ConsultationState): string {
  const e = state.escalation;
  if (!e || e.escalationLevel !== "emergency") return "";

  const redFlags = e.redFlags.map((rf) => `- ${rf.flag} (${rf.category})`).join("\n");
  return `⚠️ EMERGENCY WARNING

The following symptoms require IMMEDIATE medical evaluation:

${redFlags}

${e.recommendedAction || "Call emergency services (108 or local equivalent) or go to the nearest emergency department immediately."}

Do NOT wait to see if symptoms improve. Seek emergency care now.`;
}

function buildAssessmentGuidelines(state: ConsultationState): string {
  if (state.escalation?.escalationLevel === "emergency") {
    return `- Lead with the emergency warning. Be direct and clear.\n- Do NOT provide routine advice or assessment.\n- Do NOT diagnose the condition.`;
  }

  if (state.escalation?.escalationLevel === "urgent_care") {
    return `- Recommend same-day medical evaluation.\n- You may provide a differential alongside this recommendation.`;
  }

  if (state.escalation?.escalationLevel === "medical_review") {
    return `- Recommend a doctor visit within days.\n- Proceed with the normal assessment flow.`;
  }

  if (state.differentialDiagnosis && state.confidence) {
    const score = state.confidence.confidenceScore;
    let langGuide = "";
    if (score >= 80) langGuide = 'Use "likely" but never "definitely".';
    else if (score >= 50) langGuide = 'Use "possibly", "could be", "one explanation".';
    else langGuide = 'Emphasize uncertainty — more information is needed.';

    const selfCareGuide = state.selfCare ? `\n- Include personalized self-care advice.` : "";
    const otcGuide = state.otcGuidance && state.otcGuidance.recommendations.length > 0
      ? `\n- Include OTC medication guidance with name, purpose, dosage, and precautions.`
      : "";
    const riskGuide = state.healthRiskScore ? `\n- Include health risk assessment with score and explanation.` : "";
    const triageGuide = state.careRecommendation ? `\n- Include recommended next step with care recommendation.` : "";

    return `- Present the differential diagnosis. ${langGuide}\n- Mention remaining uncertainty.${selfCareGuide}${otcGuide}${riskGuide}${triageGuide}`;
  }

  if (state.followUp && state.followUp.questions.length > 0) {
    return `- Ask follow-up questions before providing any assessment.\n- Explain briefly why each question matters.\n- Do NOT offer any diagnostic opinion until answers are received.`;
  }

  return `- If there is enough information, provide possible conditions. Otherwise, ask follow-up questions.`;
}

export function buildSystemPrompt(state: ConsultationState): string {
  const sections: string[] = [BASE_SYSTEM_PROMPT];

  if (state.symptomAnalysis) {
    sections.push(`[CLINICAL DATA START]\n${JSON.stringify({
      symptoms: state.symptomAnalysis.allSymptoms.map((s) => ({
        symptom: s.normalized,
        severity: s.severity,
        duration: s.duration,
        location: s.bodyLocation,
        progression: s.progression,
      })),
      primarySymptom: state.symptomAnalysis.primarySymptom?.normalized,
      clinicalProfile: state.symptomAnalysis.clinicalProfile,
      missingInformation: state.symptomAnalysis.missingInformation,
      emergencyFlags: state.symptomAnalysis.emergencyFlags,
    }, null, 2)}\n[CLINICAL DATA END]`);
  }

  if (state.differentialDiagnosis && state.validation) {
    const ddx = state.validation.validatedAssessment || state.differentialDiagnosis;
    sections.push(`[DIFFERENTIAL DIAGNOSIS START]\n${JSON.stringify({
      summary: ddx.summary,
      conditions: ddx.conditions.map((c) => ({
        name: c.name,
        confidence: c.confidence,
        supportingSymptoms: c.supportingSymptoms,
        missingSymptoms: c.missingSymptoms,
        warningSigns: c.warningSigns,
      })),
      confidenceStatement: ddx.confidenceStatement,
    }, null, 2)}\n[DIFFERENTIAL DIAGNOSIS END]`);
  }

  if (state.confidence) {
    sections.push(`[CONFIDENCE START]\nScore: ${state.confidence.confidenceScore}/100 (${state.confidence.overallConfidence})
Supporting: ${state.confidence.supportingFactors.join("; ")}
Gaps: ${state.confidence.missingInformation.join("; ")}
Uncertainty: ${state.confidence.remainingUncertainty}
[CONFIDENCE END]`);
  }

  if (state.healthRiskScore) {
    sections.push(`[HEALTH RISK SCORE START]\n${JSON.stringify({
      overallScore: state.healthRiskScore.overallScore,
      riskCategory: state.healthRiskScore.riskCategory,
      riskDrivers: state.healthRiskScore.riskDrivers,
      protectiveFactors: state.healthRiskScore.protectiveFactors,
      riskExplanation: state.healthRiskScore.riskExplanation,
      missingInformation: state.healthRiskScore.missingInformation,
    }, null, 2)}\n[HEALTH RISK SCORE END]`);
  }

  if (state.careRecommendation) {
    sections.push(`[CARE RECOMMENDATION START]\n${JSON.stringify({
      careRecommendation: state.careRecommendation.careRecommendation,
      urgencyLabel: state.careRecommendation.urgencyLabel,
      reasoning: state.careRecommendation.reasoning,
      recommendedActions: state.careRecommendation.recommendedActions,
      escalationRequired: state.careRecommendation.escalationRequired,
    }, null, 2)}\n[CARE RECOMMENDATION END]`);
  }

  if (state.laboratoryTests && state.escalation?.escalationLevel !== "emergency") {
    const hasTests = state.laboratoryTests.recommendedTests.length > 0;
    sections.push(`[LAB TEST RECOMMENDATIONS START]\n${JSON.stringify({
      recommendedTests: hasTests ? state.laboratoryTests.recommendedTests.map((t) => ({
        testName: t.testName,
        clinicalReason: t.clinicalReason,
        helpsConfirmOrRuleOut: t.helpsConfirmOrRuleOut,
        priority: t.priority,
        confidence: t.confidence,
        category: t.category,
        preparation: t.preparation,
        turnaroundTime: t.turnaroundTime,
      })) : [],
      noTestsNeededReason: state.laboratoryTests.noTestsNeededReason,
      clinicalDisclaimer: state.laboratoryTests.clinicalDisclaimer,
    }, null, 2)}\n[LAB TEST RECOMMENDATIONS END]`);
  }

  if (state.followUp && state.followUp.questions.length > 0) {
    sections.push(`[REQUIRED FOLLOW-UP QUESTIONS START]\n${state.followUp.questions.map((q) => `- ${q.question} (${q.reason})`).join("\n")}\n[REQUIRED FOLLOW-UP QUESTIONS END]`);
  }

  if (state.escalation && state.escalation.escalationLevel !== "routine") {
    const ew = buildEmergencyWarning(state);
    if (ew) sections.push(`[EMERGENCY WARNING TO DELIVER]\n${ew}`);
  }

  if (state.selfCare && state.escalation?.escalationLevel !== "emergency") {
    sections.push(`[SELF-CARE PLAN START]\n${JSON.stringify({
      recommendations: state.selfCare.recommendations.map((r) => ({
        category: r.category,
        advice: r.recommendation,
        why: r.reasoning,
      })),
      monitoringAdvice: state.selfCare.monitoringAdvice,
      recoveryAdvice: state.selfCare.recoveryAdvice,
      lifestyleAdvice: state.selfCare.lifestyleAdvice,
    }, null, 2)}\n[SELF-CARE PLAN END]`);
  }

  if (state.otcGuidance && state.escalation?.escalationLevel !== "emergency" && state.otcGuidance.recommendations.length > 0) {
    sections.push(`[OTC GUIDANCE START]\n${JSON.stringify({
      recommendations: state.otcGuidance.recommendations.map((r) => ({
        medication: r.genericName,
        brands: r.brandExamples,
        purpose: r.purpose,
        dosage: r.adultDosage,
        maxDose: r.maxDailyDose,
        sideEffects: r.commonSideEffects,
        precautions: r.precautions,
        contraindications: r.contraindications,
      })),
      warnings: state.otcGuidance.medicationWarnings,
    }, null, 2)}\n[OTC GUIDANCE END]`);
  }

  if (state.remedyPlan && state.escalation?.escalationLevel !== "emergency" && state.remedyPlan.homeRemedies.length > 0) {
    sections.push(`[HOME REMEDIES START]\n${JSON.stringify({
      remedies: state.remedyPlan.homeRemedies.map((r) => ({
        condition: r.condition,
        remedy: r.remedy,
        instructions: r.instructions,
        evidence: r.evidenceLevel,
      })),
      traditionalWellness: state.remedyPlan.traditionalWellness,
      safetyWarnings: state.remedyPlan.safetyWarnings,
      evidenceLevel: state.remedyPlan.evidenceLevel,
      disclaimer: state.remedyPlan.disclaimer,
    }, null, 2)}\n[HOME REMEDIES END]`);
  }

  if (state.recoveryPlan && state.escalation?.escalationLevel !== "emergency") {
    sections.push(`[RECOVERY PLAN START]\n${JSON.stringify({
      timelines: state.recoveryPlan.recoveryTimelines.map((t) => ({
        condition: t.condition,
        expectedDuration: t.expectedDuration,
        symptomsImproveFirst: t.symptomsImproveFirst,
        symptomsPersistLonger: t.symptomsPersistLonger,
        milestones: t.milestones,
      })),
      monitoring: state.recoveryPlan.monitoringChecklist,
      followUp: state.recoveryPlan.followUpAdvice,
      dailyChecklist: state.recoveryPlan.dailyChecklist,
      recoveryStatus: state.recoveryPlan.recoveryStatus,
      expectedRecoveryDays: state.recoveryPlan.expectedRecoveryDays,
    }, null, 2)}\n[RECOVERY PLAN END]`);
  }

  if (state.preventionPlan && state.escalation?.escalationLevel !== "emergency") {
    sections.push(`[PREVENTION PLAN START]\n${JSON.stringify({
      lifestyle: state.preventionPlan.lifestyleRecommendations,
      healthEducation: state.preventionPlan.healthEducation,
      preventionStrategies: state.preventionPlan.preventionStrategies,
      wellnessTips: state.preventionPlan.wellnessTips,
      preventiveCareSuggestions: state.preventionPlan.preventiveCareSuggestions,
    }, null, 2)}\n[PREVENTION PLAN END]`);
  }

  if (state.ragEvidence) {
    sections.push(`${state.ragEvidence}

The above evidence was retrieved from the medical knowledge base. The system dynamically searches PubMed Central for relevant open-access articles when you ask a question, then uses those articles to inform the response.

When using the above medical evidence:
- Cite sources by name (e.g., "According to [Source 1]..." or "As reported by [Source name]...")
- Prioritize HIGH confidence evidence over MODERATE and LOW
- Synthesize evidence into an ORIGINAL response — do NOT copy paragraphs verbatim
- Do NOT reproduce the article's abstract, full text, or large sections
- Use short quotations only when genuinely necessary (e.g., a specific dosage or threshold)
- Prefer paraphrasing: restate findings in your own words
- If evidence contradicts the clinical assessment, acknowledge the discrepancy
- Always clarify when evidence is from general guidelines vs. patient-specific data
- Never fabricate a citation or attribute a claim to a source not listed above
- Never expose raw retrieved chunks to the user

If a user explicitly asks for the full article or large portions of source material:
- Refuse that specific request
- Provide a concise summary instead
- Include the source citation so the user can access the original document

IMPORTANT: RAG provides grounding but does NOT guarantee medical correctness.
Do NOT claim "this is medically accurate because RAG was used."`);
  }

  if (state.relevantMemories) {
    sections.push(state.relevantMemories);
  }

  sections.push(`---\nResponse Guidelines:\n${buildAssessmentGuidelines(state)}\n- Do NOT recommend medications, treatments, home remedies, or doctor names.\n- This is not a diagnosis — include a disclaimer.`);

  return sections.join("\n\n");
}

export function getEffectiveDDx(state: ConsultationState): AssessmentResult | null {
  return state.validation?.validatedAssessment ?? state.differentialDiagnosis;
}
