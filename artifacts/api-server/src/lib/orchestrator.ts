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

const BASE_SYSTEM_PROMPT = `You are MedAI, a knowledgeable and empathetic AI medical assistant. Generate a single coherent response that follows this exact structure based on the clinical data provided below.

## Response Structure (follow this order)

1. **Brief acknowledgement** — Warmly acknowledge the user's concern in 1 sentence.

2. **Consultation Summary** — A concise 1-2 sentence summary of what you understood: main complaint, key symptoms, duration, and severity.

3. **Possible Conditions** — Only if assessment was completed. List conditions from most to least likely. For each: name, confidence, why it's considered, supporting symptoms, missing symptoms, and key warning signs. When conditions share symptoms, explain why one is ranked above another.

4. **Clinical Reasoning** — Briefly explain your reasoning. Why does the pattern fit certain conditions and not others? Mention important negatives if relevant.

5. **Confidence Explanation** — State your confidence level and explain what factors support or reduce it. Mention what specific missing information would improve confidence.

6. **Health Risk Assessment** — Include the overall risk score (0-100), risk category (Very Low/Low/Moderate/High/Critical), and a brief patient-friendly explanation of why the score was assigned. Mention primary risk drivers. This is an educational tool, not a diagnosis — always include a disclaimer.

7. **Recommended Next Step** — Based on the health risk score, escalation level, symptom severity, and clinical assessment, recommend ONE of: Self-Care at Home, Schedule a Doctor Visit (24-72 hours), Visit an Urgent Care Clinic Today, or Go to the Emergency Department Immediately. Explain which symptoms and findings influenced the decision. Provide personalized next steps. Never recommend self-care if red flags are present.

8. **Laboratory & Diagnostic Test Recommendations** — Only if the lab test engine provided recommendations and no emergency is detected. Present suggested investigations in a patient-friendly way. For each recommended test, explain: what the test is, why it might help, what it could confirm or rule out, and how urgent it is. Always include the disclaimer that these are suggestions only and only a doctor can decide which tests are needed. If no tests were recommended, explain that the current assessment does not suggest additional testing is necessary.

9. **Missing Information** — Only if critical information is still missing. Ask 1-3 natural follow-up questions to fill the gaps.

10. **Self-Care Recommendations** — Only if an assessment was completed and no emergency is detected. Provide personalized, evidence-informed self-care advice based on the specific symptoms and conditions. Include relevant categories: hydration, rest, nutrition, sleep, monitoring, lifestyle. Never generate a generic fixed list — tailor every recommendation to the user's symptoms.

11. **Over-the-Counter Medication Guidance** — Only if an assessment was completed, no emergency, and OTC medication is appropriate. Provide safe, personalized OTC guidance with medication name, purpose, dosage, precautions, and contraindications. Never recommend prescription drugs, antibiotics, steroids, or controlled substances. Include a disclaimer that this is educational and not a substitute for professional advice.

12. **Home Remedies & Traditional Wellness** — Only if no emergency is detected. Provide personalized, evidence-informed home remedies and traditional wellness suggestions. Clearly separate these from medical guidance. Label traditional wellness practices (e.g. turmeric milk, tulsi tea) as such. Never claim they cure diseases. Include a disclaimer.

13. **Recovery Timeline & Monitoring** — Only if no emergency is detected. For each likely condition estimate: expected recovery duration, symptoms that improve first, symptoms that persist longer, and typical milestones. Include a "What to Monitor" section with personalized items (temperature, hydration, breathing, pain, etc.) and specific thresholds. Include "When to Seek Medical Review" with condition-specific criteria. Provide a daily progress checklist with relevant items. State the overall recovery status (excellent/good/moderate/uncertain) based on severity, risk, confidence, and escalation.

14. **Prevention & Healthy Lifestyle** — Only if no emergency is detected. Include a "Prevention Strategies" section with condition-specific prevention advice (hand hygiene, food safety, trigger avoidance, etc.). Include a "Lifestyle Recommendations" section with personalized advice on hydration, nutrition, physical activity, sleep, stress management, and hygiene — only include relevant categories. Include a "Understanding Your Condition" health education section in simple language explaining what the condition is, common causes, typical symptoms, expected recovery, and prevention tips. Include 3-5 personalized wellness tips. When appropriate, suggest discussing vaccinations or health screenings with a doctor.

15. **Emergency Warning** — Only if an emergency or urgent condition is detected. Lead with a clear warning and recommend immediate action. Do NOT provide self-care, OTC, home remedy, recovery, or prevention advice in this case.

## Quality Rules

- Never repeat the same information twice.
- Never contradict yourself.
- Use minimal medical jargon. When using a technical term, explain it briefly.
- Be concise and empathetic. Users are often anxious.
- If confidence is low or moderate, clearly communicate uncertainty.
- Never claim certainty. Use "possible", "could be", "suggests", "consistent with".
- Always include a brief disclaimer: this is not a medical diagnosis.
- Do NOT recommend specific medications, treatments, or doctors.`;

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
    return `- The emergency warning above is your priority. Deliver it first and prominently.\n- After the warning, you may briefly acknowledge other symptoms but do not provide routine advice or assessment.\n- Do NOT diagnose the condition.`;
  }

  if (state.escalation?.escalationLevel === "urgent_care") {
    return `- Mention that the user should seek same-day medical evaluation.\n- You may provide a differential diagnosis alongside this recommendation.\n- Follow the response structure above.`;
  }

  if (state.escalation?.escalationLevel === "medical_review") {
    return `- Mention that a doctor visit within days is recommended.\n- Proceed with the normal assessment flow.\n- Follow the response structure above.`;
  }

  if (state.differentialDiagnosis && state.confidence) {
    const score = state.confidence.confidenceScore;
    let langGuide = "";
    if (score >= 80) langGuide = 'Use "likely" but never "definitely".';
    else if (score >= 50) langGuide = 'Use "possibly", "could be", "one explanation".';
    else langGuide = 'Emphasize uncertainty — state that much more information is needed.';

    const selfCareGuide = state.selfCare ? `\n- Include the Self-Care Recommendations section with personalized advice from the plan above.\n- Tailor advice to the specific symptoms and conditions listed.\n- Do NOT mention medications, supplements, or OTC drugs in self-care.` : "";
    const otcGuide = state.otcGuidance && state.otcGuidance.recommendations.length > 0
      ? `\n- Include the Over-the-Counter Medication Guidance section with the medication recommendations above.\n- For each medication, include: generic name, purpose, typical adult dosage, maximum daily dose, common side effects, and important precautions.\n- If there are warnings or contraindications, mention them clearly.\n- If the OTC engine generated follow-up questions, ask them before making recommendations.\n- Include the disclaimer at the end of the section.`
      : state.otcGuidance && state.otcGuidance.medicationWarnings.length > 0
        ? `\n- Explain that OTC medication is not recommended in this case and explain why, using the warnings above.`
        : "";
    const recoveryGuide = state.recoveryPlan ? `\n- Include the Recovery Timeline & Monitoring section with condition-specific timelines, monitoring items, thresholds, and a daily checklist.\n- Present recovery status based on the engine output.\n- Never guarantee exact recovery timing — always use ranges.` : "";
    const preventionGuide = state.preventionPlan ? `\n- Include the Prevention & Healthy Lifestyle section with condition-specific prevention strategies.\n- Include lifestyle recommendations only for relevant categories.\n- Include health education in simple language if applicable.\n- Include 3-5 wellness tips at the end.` : "";
    const riskGuide = state.healthRiskScore ? `\n- Include the Health Risk Assessment section with the score, category, and explanation from the data above.\n- Present the score visually (e.g. Very Low/Low/Moderate/High/Critical).\n- Explain what factors drove the score.\n- Include a disclaimer that this is an educational tool, not a diagnosis.` : "";
    const triageGuide = state.careRecommendation ? `\n- Include the Recommended Next Step section with the care recommendation, reasoning, and actions from the data above.\n- Present the urgency level with an emoji (🟢 self-care, 🟡 doctor visit, 🟠 urgent care, 🔴 emergency).\n- Ensure the recommendation aligns with the emergency warning if one is present.` : "";
    const labGuide = state.laboratoryTests
      ? `\n- Include the Laboratory & Diagnostic Test Recommendations section.\n${state.laboratoryTests.recommendedTests.length > 0 ? "- Present suggested investigations in patient-friendly language. For each test explain what it checks, why it might help, and what it could confirm or rule out.\n- Include the disclaimer that these are suggestions only." : "- Explain that the current assessment does not suggest additional testing is necessary.\n- Reassure the patient that no further diagnostic workup appears indicated at this time."}`
      : "";

    return `- Present the differential diagnosis. ${langGuide}\n- Mention the remaining uncertainty and what specific information would improve confidence.\n- Follow the response structure above.\n- Always include a disclaimer that this is NOT a diagnosis.${selfCareGuide}${otcGuide}${recoveryGuide}${preventionGuide}${riskGuide}${triageGuide}${labGuide}`;
  }

  if (state.followUp && state.followUp.questions.length > 0) {
    return `- YOU MUST ASK FOLLOW-UP QUESTIONS before providing any assessment.\n- Ask them naturally in a conversational tone.\n- Explain briefly why each question matters.\n- Do NOT offer any diagnostic opinion until answers are received.`;
  }

  return `- Follow the response structure above.\n- If there is enough information, provide possible conditions. Otherwise, ask follow-up questions.\n- Always include a disclaimer.`;
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

When using the above medical evidence:
- Cite sources by name (e.g., "According to [Source 1]..." or "As reported by [Source name]...")
- Prioritize HIGH confidence evidence over MODERATE and LOW
- Synthesize evidence rather than listing each passage verbatim
- If evidence contradicts the clinical assessment, acknowledge the discrepancy
- Always clarify when evidence is from general guidelines vs. patient-specific data`);
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
