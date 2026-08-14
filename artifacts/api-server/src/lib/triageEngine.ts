import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { ConfidenceAssessment } from "./confidenceEngine";
import type { EscalationResult } from "./escalationEngine";
import type { HealthRiskScore } from "./riskEngine";

const TRIAGE_TIMEOUT_MS = 12_000;

export type UrgencyLevel = "self_care" | "doctor_visit" | "urgent_care" | "emergency";

export interface CareRecommendation {
  careRecommendation: UrgencyLevel;
  urgencyLabel: string;
  reasoning: string;
  recommendedActions: string[];
  escalationRequired: boolean;
}

const TRIAGE_PROMPT = `You are an emergency medicine physician and triage specialist. Determine the most appropriate level of medical care based on the complete clinical assessment.

You will receive: symptom data (severity, duration, progression), clinical profile (age, pregnancy, conditions), differential diagnosis (conditions with confidence), confidence assessment (0-100), health risk score (0-100, category), and escalation level.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "careRecommendation": "self_care | doctor_visit | urgent_care | emergency",
  "urgencyLabel": "Self-Care at Home | Schedule a Doctor Visit (24-72 hours) | Visit an Urgent Care Clinic Today | Go to the Emergency Department Immediately",
  "reasoning": "Brief patient-friendly explanation of why this care level is recommended. Mention specific symptoms, risk factors, and findings that influenced the decision. 2-3 sentences max.",
  "recommendedActions": ["Action 1", "Action 2", "Action 3"],
  "escalationRequired": true | false
}

## Triage Decision Rules

### Emergency (🔴 Go to the Emergency Department Immediately)
If ANY of these are true:
- Escalation level is "emergency"
- Health risk score >= 81 (Critical)
- Symptoms: chest pain, difficulty breathing, severe allergic reaction, stroke symptoms (facial drooping, arm weakness, speech difficulty), severe head injury, uncontrolled bleeding, severe burns, poisoning, suicidal thoughts
- Red flags: cardiovascular (chest pain, palpitations), neurological (sudden severe headache, vision loss, seizure), respiratory (difficulty breathing, stridor), severe allergic (anaphylaxis)

### Urgent Care (🟠 Visit an Urgent Care Clinic Today)
If ANY of these are true:
- Escalation level is "urgent_care"
- Health risk score 61-80 (High)
- Moderate to severe symptoms lasting > 3 days without improvement
- High fever (> 103°F / 39.4°C) in adult
- Persistent vomiting or diarrhea with dehydration risk
- Moderate abdominal pain
- Suspected infection needing evaluation
- Minor cuts needing stitches
- Urinary symptoms suggesting infection
- Health risk score >= 41 AND primary symptom is worsening

### Doctor Visit (🟡 Schedule a Doctor Visit within 24-72 hours)
If ANY of these are true:
- Escalation level is "medical_review"
- Health risk score 41-60 (Moderate)
- Symptoms persisting > 7 days without improvement
- Mild to moderate symptoms requiring evaluation
- Chronic condition flare-up
- Need for prescription treatment
- Symptoms not improving with self-care
- Follow-up for ongoing issue

### Self-Care (🟢 Self-Care at Home)
If ALL of these are true:
- Escalation level is "routine"
- Health risk score 0-40 (Very Low or Low)
- Mild symptoms
- Acute onset < 3 days
- No red flags
- Self-limiting condition suspected
- Good confidence in assessment (>= 50)

## Safety Overrides
1. Emergency level ALWAYS overrides any other recommendation.
2. If health risk score conflicts with escalation, use the escalation.
3. If red flags are present, the recommendation must be at least "urgent_care" — never "self_care".
4. For pregnant patients with moderate symptoms, prefer urgent care over self-care.
5. For elderly (65+) or very young (< 2) with moderate symptoms, prefer urgent care over self-care.
6. Uncertainty in assessment (confidence < 50) should shift recommendation toward a higher care level.
7. Never recommend "self_care" if any red flag symptom is present.

## Reasoning Rules
- Reference specific symptoms that drove the decision.
- Mention risk score if applicable.
- Note if uncertainty affected the recommendation.
- Use patient-friendly language, not medical jargon.
- Keep the explanation concise (2-3 sentences).

## Actions Rules
- For emergency: "Go to the nearest emergency department immediately" or "Call emergency services"
- For urgent care: "Visit an urgent care clinic today", "Avoid eating or drinking until evaluated"
- For doctor visit: "Schedule an appointment with your primary care provider", "Continue monitoring symptoms"
- For self-care: "Continue monitoring symptoms", "Rest and stay hydrated", specific symptom-based actions`;

export async function generateCareRecommendation(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  confidence: ConfidenceAssessment | null,
  escalation: EscalationResult | null,
  healthRiskScore: HealthRiskScore | null,
): Promise<CareRecommendation | null> {
  const isEmergency = escalation?.escalationLevel === "emergency";

  const contents = `[SYMPTOM DATA]\n${JSON.stringify({
    symptoms: analysis.allSymptoms.map((s) => ({
      original: s.original,
      normalized: s.normalized,
      severity: s.severity,
      duration: s.duration,
      location: s.bodyLocation,
      progression: s.progression,
    })),
    clinicalProfile: analysis.clinicalProfile,
    primarySymptom: analysis.primarySymptom?.normalized,
    emergencyFlags: analysis.emergencyFlags,
  }, null, 2)}\n[/SYMPTOM DATA]\n\n[DIFFERENTIAL DIAGNOSIS]\n${assessment ? JSON.stringify({
    conditions: assessment.conditions.map((c) => ({
      name: c.name,
      confidence: c.confidence,
      warningSigns: c.warningSigns,
    })),
  }, null, 2) : "not available"}\n[/DIFFERENTIAL DIAGNOSIS]\n\n[CONFIDENCE]\nScore: ${confidence?.confidenceScore ?? "not available"}/100\nLevel: ${confidence?.overallConfidence ?? "not available"}\n[/CONFIDENCE]\n\n[HEALTH RISK SCORE]\nScore: ${healthRiskScore?.overallScore ?? "not available"}\nCategory: ${healthRiskScore?.riskCategory ?? "not available"}\n[/HEALTH RISK SCORE]\n\n[ESCALATION]\nLevel: ${escalation?.escalationLevel ?? "routine"}\nRed Flags: ${escalation?.redFlags?.map((f) => f.flag).join("; ") ?? "none"}\n[/ESCALATION]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIAGE_TIMEOUT_MS);

  try {
    const result = await generateJSON<CareRecommendation>({
      systemPrompt: TRIAGE_PROMPT,
      userContent: contents,
      temperature: 0.2,
      maxTokens: 1024,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (result && isEmergency) {
      result.careRecommendation = "emergency";
      result.urgencyLabel = "Go to the Emergency Department Immediately";
      result.escalationRequired = true;
      if (!result.reasoning.startsWith("Your symptoms require immediate")) {
        result.reasoning = `Your symptoms require immediate medical evaluation. ${result.reasoning}`;
      }
      if (result.recommendedActions.length === 0) {
        result.recommendedActions = ["Go to the nearest emergency department immediately", "Call emergency services if transportation is not available", "Do not wait to see if symptoms improve"];
      }
    }

    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[triageEngine] generation failed:", message);

    if (isEmergency) {
      return {
        careRecommendation: "emergency",
        urgencyLabel: "Go to the Emergency Department Immediately",
        reasoning: "Your symptoms require immediate medical evaluation. Please seek emergency care without delay.",
        recommendedActions: [
          "Go to the nearest emergency department immediately",
          "Call emergency services if transportation is not available",
          "Do not wait to see if symptoms improve",
        ],
        escalationRequired: true,
      };
    }

    return null;
  }
}
