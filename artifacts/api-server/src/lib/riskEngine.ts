import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { ConfidenceAssessment } from "./confidenceEngine";
import type { EscalationResult } from "./escalationEngine";

const RISK_TIMEOUT_MS = 12_000;

export type RiskCategory = "very_low" | "low" | "moderate" | "high" | "critical";

export interface HealthRiskScore {
  overallScore: number;
  riskCategory: RiskCategory;
  riskDrivers: {
    primary: string[];
    secondary: string[];
  };
  protectiveFactors: string[];
  confidence: number;
  riskExplanation: string;
  missingInformation: string[];
}

const RISK_PROMPT = `You are a clinical decision support specialist. Calculate a personalized Health Risk Score (0-100) based on all available consultation data.

You will receive: symptom data (severity, duration, body location, progression), clinical profile (age, pregnancy, conditions, allergies, medications), differential diagnosis (conditions with confidence), confidence assessment (0-100), escalation level, and emergency flags.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "overallScore": 0-100,
  "riskCategory": "very_low | low | moderate | high | critical",
  "riskDrivers": {
    "primary": ["Factor 1", "Factor 2"],
    "secondary": ["Factor 3", "Factor 4"]
  },
  "protectiveFactors": ["Factor 1", "Factor 2"],
  "confidence": 0-100,
  "riskExplanation": "Patient-friendly explanation of why this score was assigned. 2-3 sentences max.",
  "missingInformation": ["What data would improve risk assessment accuracy"]
}

## Scoring Rubric

Score the risk on a 0-100 scale using these factors:

### Severity (0-30 points)
- mild symptoms: 0-5
- moderate symptoms: 6-15
- severe symptoms: 16-25
- critical/emergency symptoms: 26-30

### Duration & Progression (0-15 points)
- acute (< 24h, stable): 0-3
- acute (< 24h, worsening): 4-7
- persistent (1-7 days, stable): 3-6
- persistent (1-7 days, worsening): 7-11
- chronic (> 7 days) with worsening: 8-12
- rapidly worsening: 12-15

### Number & Distribution of Symptoms (0-10 points)
- 1 localized symptom: 0-2
- 2-3 mild symptoms: 2-5
- 3+ moderate symptoms: 5-8
- multiple severe/systemic symptoms: 8-10

### Emergency / Red Flag Indicators (0-20 points)
- no red flags: 0
- 1 minor red flag: 3-5
- multiple or significant red flags: 8-15
- critical red flags (chest pain, difficulty breathing, stroke symptoms): 16-20

### Clinical Profile Risk Factors (0-15 points)
- young healthy adult: 0-2
- elderly (65+) or very young (< 2): 3-6
- pregnant: 4-7
- chronic condition present: 3-8
- multiple comorbidities: 6-10
- immunosuppressed: 7-10
- known allergies to relevant treatments: 2-5
- on medications that affect presentation: 2-5

### Differential Diagnosis Risk (0-10 points)
- self-limiting conditions only: 0-2
- conditions requiring treatment: 3-5
- potentially serious conditions in DDx: 5-8
- high-urgency conditions in DDx: 8-10

### Total Score = sum of all factors

## Category Mapping
- 0-20: very_low (self-limiting, routine)
- 21-40: low (minor illness, good prognosis)
- 41-60: moderate (requires monitoring, possible treatment)
- 61-80: high (likely needs medical evaluation)
- 81-100: critical (requires immediate attention)

## Safety Rules
1. If escalation level is "emergency" -> score MUST be 81-100, riskCategory MUST be "critical"
2. If escalation level is "urgent_care" -> score MUST be 61-80, riskCategory MUST be "high"
3. Do NOT assign a low score if there are red flags present.
4. Consider the differential diagnosis weight — a condition with high confidence in a serious illness should increase score.
5. Protective factors should genuinely reduce risk (young age, no comorbidities, mild symptoms, no red flags).
6. Confidence in the risk score should reflect how much data was available.
7. Missing information should list what would make the score more accurate.
8. The explanation must be in patient-friendly language, not medical jargon.`;

export async function calculateHealthRiskScore(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  confidence: ConfidenceAssessment | null,
  escalation: EscalationResult | null,
): Promise<HealthRiskScore | null> {
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
    missingInformation: analysis.missingInformation,
  }, null, 2)}\n[/SYMPTOM DATA]\n\n[DIFFERENTIAL DIAGNOSIS]\n${assessment ? JSON.stringify({
    conditions: assessment.conditions.map((c) => ({
      name: c.name,
      confidence: c.confidence,
      urgency: c.warningSigns,
    })),
  }, null, 2) : "not available"}\n[/DIFFERENTIAL DIAGNOSIS]\n\n[CONFIDENCE]\nScore: ${confidence?.confidenceScore ?? "not available"}/100\nLevel: ${confidence?.overallConfidence ?? "not available"}\n[/CONFIDENCE]\n\n[ESCALATION]\nLevel: ${escalation?.escalationLevel ?? "routine"}\nRed Flags: ${escalation?.redFlags?.map((f) => f.flag).join("; ") ?? "none"}\n[/ESCALATION]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RISK_TIMEOUT_MS);

  try {
    const result = await generateJSON<HealthRiskScore>({
      systemPrompt: RISK_PROMPT,
      userContent: contents,
      temperature: 0.2,
      maxTokens: 1024,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (result && isEmergency) {
      result.overallScore = Math.max(result.overallScore, 81);
      result.riskCategory = "critical";
      result.riskExplanation = `You have symptoms that require immediate medical attention. Your risk score reflects this urgency. ${result.riskExplanation}`;
    }

    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[riskEngine] generation failed:", message);

    if (isEmergency) {
      return {
        overallScore: 95,
        riskCategory: "critical",
        riskDrivers: { primary: ["Emergency symptoms detected"], secondary: [] },
        protectiveFactors: [],
        confidence: 90,
        riskExplanation: "Your symptoms require immediate medical attention. Please seek emergency care without delay.",
        missingInformation: [],
      };
    }

    return null;
  }
}
