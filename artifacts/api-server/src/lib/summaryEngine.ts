import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { ValidationResult } from "./validationEngine";
import type { ConfidenceAssessment } from "./confidenceEngine";

const SUMMARY_TIMEOUT_MS = 12_000;

export interface ClinicalSummary {
  consultationSummary: string;
  clinicalImpression: string;
  keyFindings: {
    importantSymptoms: string[];
    importantNegatives: string[];
    emergencyFindings: string[];
    missingInformation: string[];
  };
  assessmentQuality: {
    overallConfidence: "Excellent" | "Good" | "Fair" | "Limited";
    informationCompleteness: "Excellent" | "Good" | "Fair" | "Limited";
    followUpCompletion: "Excellent" | "Good" | "Fair" | "Limited";
    assessmentReliability: "Excellent" | "Good" | "Fair" | "Limited";
  };
  patientFriendlySummary: string;
}

const SUMMARY_PROMPT = `You are a clinical documentation specialist. Generate a structured consultation summary from the available clinical data.

You will receive:
1. Symptom analysis data
2. Differential diagnosis (if available)
3. Validation issues (if any)
4. Confidence assessment (if available)
5. The conversation transcript

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "consultationSummary": "A concise 2-3 sentence narrative summarizing the main complaint, key symptoms, duration, severity, and any relevant follow-up information. Write this as a clinician would in a patient chart.",
  "clinicalImpression": "The most likely clinical impression based on the available information. Never claim certainty. Use phrases like 'most consistent with', 'suggests', 'raises concern for'. Mention other possibilities if the picture is unclear.",
  "keyFindings": {
    "importantSymptoms": ["the most clinically significant symptoms reported"],
    "importantNegatives": ["notable absences that help narrow the differential"],
    "emergencyFindings": ["any emergency or red flag findings, or empty array if none"],
    "missingInformation": ["key information gaps that would improve diagnostic confidence"]
  },
  "assessmentQuality": {
    "overallConfidence": "Excellent | Good | Fair | Limited",
    "informationCompleteness": "Excellent | Good | Fair | Limited",
    "followUpCompletion": "Excellent | Good | Fair | Limited",
    "assessmentReliability": "Excellent | Good | Fair | Limited"
  },
  "patientFriendlySummary": "A 2-3 sentence explanation in plain, jargon-free language that a patient without medical training can understand. Example: 'Based on what you've told me, it sounds like you may have a common viral infection, but more information would help me be more certain.'"
}

Guidelines:
- consultationSummary: Professional tone, present-tense, third-person when appropriate. Keep it brief.
- clinicalImpression: Always include a caveat about uncertainty.
- keyFindings.emergencyFindings: Include ANY red flags found. If escalation was emergency, document it clearly.
- assessmentQuality: Base on the available data — if no assessment was done (e.g., emergency or follow-up phase), mark as Limited.
- patientFriendlySummary: Warm, clear, and direct. Use analogies if helpful. Never use medical jargon.
- Do NOT add medications, treatments, or doctor recommendations to the summary.`;

export async function generateClinicalSummary(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  validation: ValidationResult | null,
  confidence: ConfidenceAssessment | null,
  conversationHistory: { role: string; content: string }[],
  latestUserMessage: string,
): Promise<ClinicalSummary | null> {
  const historyText = conversationHistory.map((m) => `${m.role}: ${m.content}`).join("\n");

  const contents = `[SYMPTOM ANALYSIS]\n${JSON.stringify(analysis, null, 2)}\n[/SYMPTOM ANALYSIS]\n\n[DIFFERENTIAL DIAGNOSIS]\n${assessment ? JSON.stringify(assessment, null, 2) : "not generated"}\n[/DIFFERENTIAL DIAGNOSIS]\n\n[VALIDATION]\n${validation ? JSON.stringify(validation.issues, null, 2) : "none"}\n[/VALIDATION]\n\n[CONFIDENCE]\n${confidence ? JSON.stringify(confidence, null, 2) : "not assessed"}\n[/CONFIDENCE]\n\n[CONVERSATION]\n${historyText}\n[/CONVERSATION]\n\n[LATEST MESSAGE]\n${latestUserMessage}\n[/LATEST MESSAGE]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);

  try {
    const result = await generateJSON<ClinicalSummary>({
      systemPrompt: SUMMARY_PROMPT,
      userContent: contents,
      temperature: 0.2,
      maxTokens: 1536,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[summaryEngine] generation failed:", message);
    return null;
  }
}
