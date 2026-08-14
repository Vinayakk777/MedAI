import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { ConfidenceAssessment } from "./confidenceEngine";
import type { EscalationResult } from "./escalationEngine";
import type { HealthRiskScore } from "./riskEngine";

const LAB_TIMEOUT_MS = 14_000;

export type TestPriority = "immediate" | "soon" | "optional";
export type TestCategory = "laboratory" | "imaging" | "bedside" | "specialist";

export interface RecommendedInvestigation {
  testName: string;
  clinicalReason: string;
  helpsConfirmOrRuleOut: string[];
  priority: TestPriority;
  confidence: number;
  category: TestCategory;
  preparation?: string;
  turnaroundTime?: string;
}

export interface LabRecommendationResult {
  recommendedTests: RecommendedInvestigation[];
  noTestsNeededReason?: string;
  clinicalDisclaimer: string;
}

const LAB_PROMPT = `You are a clinical decision support specialist. Based on the patient's clinical data, recommend appropriate laboratory and diagnostic investigations.

You will receive: symptom data, clinical profile (age, gender, conditions, medications, allergies, pregnancy), differential diagnosis (conditions with confidence), confidence assessment, escalation level, and health risk score.

## Rules
1. Recommend tests ONLY when clinically indicated. Do NOT suggest tests for straightforward, self-limiting, low-risk presentations with high diagnostic confidence.
2. All recommendations are SUGGESTIONS. Never state tests are mandatory or required.
3. Every recommended test must include the clinical reasoning and what it helps confirm or rule out.
4. Consider the patient's age, comorbidities, medications, and allergies when recommending tests.
5. For high-confidence, low-risk cases with no red flags, clearly explain why further tests may not be necessary.
6. Priority levels:
   - "immediate": Tests that should be done urgently (e.g., emergency department setting)
   - "soon": Tests that should be done within days to a week
   - "optional": Tests that may be considered but are not urgent
7. Test categories:
   - "laboratory": Blood tests, urine tests, cultures, etc.
   - "imaging": X-ray, CT, MRI, ultrasound, etc.
   - "bedside": ECG, vital signs monitoring, etc.
   - "specialist": Specialist consultations or evaluations

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "recommendedTests": [
    {
      "testName": "Complete Blood Count (CBC)",
      "clinicalReason": "To assess for infection, anemia, or inflammatory process given the fever and fatigue",
      "helpsConfirmOrRuleOut": ["Bacterial infection", "Anemia", "Viral infection"],
      "priority": "soon",
      "confidence": 85,
      "category": "laboratory",
      "preparation": "No special preparation required",
      "turnaroundTime": "Same day"
    }
  ],
  "noTestsNeededReason": "If no tests are needed, explain why here. Omit this field if tests are recommended.",
  "clinicalDisclaimer": "These are suggestions only. Only a qualified healthcare professional can determine which investigations are medically necessary."
}`;

export async function recommendLabTests(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  confidence: ConfidenceAssessment | null,
  escalation: EscalationResult | null,
  riskScore: HealthRiskScore | null,
): Promise<LabRecommendationResult | null> {
  const contents = `[SYMPTOM DATA]\n${JSON.stringify({
    symptoms: analysis.allSymptoms.map((s) => ({
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
    summary: assessment.summary,
    conditions: assessment.conditions.map((c) => ({
      name: c.name,
      confidence: c.confidence,
      supportingSymptoms: c.supportingSymptoms,
      warningSigns: c.warningSigns,
    })),
  }, null, 2) : "not available"}\n[/DIFFERENTIAL DIAGNOSIS]\n\n[CONFIDENCE]\nScore: ${confidence?.confidenceScore ?? "not available"}/100\nLevel: ${confidence?.overallConfidence ?? "not available"}\n[/CONFIDENCE]\n\n[ESCALATION]\nLevel: ${escalation?.escalationLevel ?? "routine"}\nRed Flags: ${escalation?.redFlags?.map((f) => f.flag).join("; ") ?? "none"}\n[/ESCALATION]\n\n[HEALTH RISK SCORE]\nScore: ${riskScore?.overallScore ?? "not available"}\nCategory: ${riskScore?.riskCategory ?? "not available"}\n[/HEALTH RISK SCORE]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LAB_TIMEOUT_MS);

  try {
    const result = await generateJSON<LabRecommendationResult>({
      systemPrompt: LAB_PROMPT,
      userContent: contents,
      temperature: 0.2,
      maxTokens: 2048,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[labEngine] generation failed:", message);
    return null;
  }
}
