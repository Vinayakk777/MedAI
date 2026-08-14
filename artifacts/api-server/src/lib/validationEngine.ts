import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";

const VALIDATION_TIMEOUT_MS = 12_000;

export interface ValidationIssue {
  conditionName: string;
  issueType: "contradiction" | "missing_critical_symptom" | "weak_evidence" | "confidence_overestimation";
  description: string;
}

export interface ValidationResult {
  validatedAssessment: AssessmentResult;
  issues: ValidationIssue[];
  contradictionsFound: string[];
}

const VALIDATION_PROMPT = `You are a medical knowledge validation layer. Your job is to review a differential diagnosis and check each condition for medical plausibility and internal consistency.

You will receive:
1. The symptom analysis data (extracted symptoms from the user)
2. The proposed differential diagnosis (ranked conditions)

For each condition, verify:

1. CONTRADICTIONS — Does the condition require a symptom the user explicitly does NOT have? Examples of contradictions:
   - Migraine listed but the user has NO headache
   - Food poisoning listed but the user has NO gastrointestinal symptoms (vomiting, diarrhea, nausea)
   - Asthma listed but the user has NO respiratory symptoms (cough, wheezing, shortness of breath)
   - Kidney stones listed but the user has NO flank or abdominal pain
   - Heart attack listed but the user has NO chest pain, arm pain, or shortness of breath
   - UTI listed but the user has NO urinary symptoms
   - Sinusitis listed but the user has NO facial pain or nasal symptoms

2. MISSING CRITICAL SYMPTOMS — Does the condition typically present with symptoms the user hasn't reported? If critical expected symptoms are absent, the condition becomes less plausible.

3. WEAK EVIDENCE — Is the condition supported only by vague symptoms that overlap with many other conditions? If so, flag it.

4. CONFIDENCE OVERESTIMATION — Is the assigned confidence too high given the available evidence?

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "validatedAssessment": {
    "summary": "The original summary (or slightly reworded if needed)",
    "conditions": [
      {
        "name": "Condition name",
        "confidence": "Adjusted confidence: Low | Moderate | High",
        "explanation": "Updated explanation reflecting validation findings. If conditions were removed, note that here.",
        "commonSymptoms": ["typical symptoms"],
        "supportingSymptoms": ["symptoms the user HAS"],
        "missingSymptoms": ["symptoms the user has NOT reported"],
        "warningSigns": ["red flags"]
      }
    ],
    "confidenceStatement": "Updated overall confidence statement reflecting validation"
  },
  "issues": [
    {
      "conditionName": "Name of affected condition",
      "issueType": "contradiction | missing_critical_symptom | weak_evidence | confidence_overestimation",
      "description": "What the validation issue is"
    }
  ],
  "contradictionsFound": ["Description of each contradiction found"]
}

Rules:
- If a condition has a CONTRADICTION, REMOVE it from the validatedAssessment.conditions list. It should not appear in the output at all.
- If a condition has weak evidence but no contradiction, keep it but lower confidence to Low.
- If confidence is overestimated, lower it (High → Moderate, Moderate → Low).
- Never increase confidence.
- Keep no more than 5 conditions (remove the weakest ones if there are too many).
- The validatedAssessment.confidenceStatement must mention that the assessment has been reviewed for consistency.
- Do NOT add medications, treatments, or doctor recommendations.`;

export async function validateAssessment(
  assessment: AssessmentResult,
  analysis: SymptomAnalysis,
): Promise<ValidationResult | null> {
  const contents = `[SYMPTOM ANALYSIS]\n${JSON.stringify(analysis, null, 2)}\n[/SYMPTOM ANALYSIS]\n\n[PROPOSED DIFFERENTIAL DIAGNOSIS]\n${JSON.stringify(assessment, null, 2)}\n[/PROPOSED DIFFERENTIAL DIAGNOSIS]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const result = await generateJSON<ValidationResult>({
      systemPrompt: VALIDATION_PROMPT,
      userContent: contents,
      temperature: 0.1,
      maxTokens: 1536,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[validationEngine] validation failed:", message);
    return null;
  }
}
