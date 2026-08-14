import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { ValidationResult } from "./validationEngine";

const CONFIDENCE_TIMEOUT_MS = 10_000;

export interface ConfidenceFactor {
  name: string;
  impact: "positive" | "negative" | "neutral";
  description: string;
}

export interface ConfidenceAssessment {
  overallConfidence: "high" | "moderate" | "low";
  confidenceScore: number;
  supportingFactors: string[];
  missingInformation: string[];
  contradictions: string[];
  remainingUncertainty: string;
  factorsConsidered: ConfidenceFactor[];
}

const CONFIDENCE_PROMPT = `You are a confidence and uncertainty reasoning engine. Your job is to evaluate the quality and completeness of clinical information and produce a calibrated confidence assessment.

You will receive:
1. The symptom analysis data (what symptoms were extracted, what's missing)
2. The differential diagnosis (proposed conditions with their confidence levels)
3. Any validation issues found (contradictions, weak evidence)
4. The conversation history

Based on this data, calculate confidence using these factors:

1. MATCHING SYMPTOMS — How many of the user's symptoms align with the top conditions? More matches → higher confidence.
2. KEY SUPPORTING SYMPTOMS — Are pathognomonic or highly characteristic symptoms present for the top condition?
3. MISSING INFORMATION — How much critical information is missing? More gaps → lower confidence.
4. CONTRADICTIONS — Were any contradictions found? Contradictions significantly reduce confidence.
5. FOLLOW-UP QUALITY — Has the user answered follow-up questions substantively, or are answers vague?
6. COMPETING CONDITIONS — How many equally plausible conditions exist? More competition → lower confidence.
7. EMERGENCY INDICATORS — Even without a full emergency flag, are there concerning patterns?

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "overallConfidence": "high | moderate | low",
  "confidenceScore": 0-100,
  "supportingFactors": ["factor that supports confidence"],
  "missingInformation": ["specific gap that reduces confidence"],
  "contradictions": ["contradiction found"],
  "remainingUncertainty": "A clear statement of what remains uncertain and why",
  "factorsConsidered": [
    {
      "name": "Factor name (e.g. matching_symptoms, missing_information, contradictions)",
      "impact": "positive | negative | neutral",
      "description": "How this factor affected the confidence assessment"
    }
  ]
}

Calibration guidelines:
- 80-100: High confidence — strong symptom match, minimal missing info, no contradictions, clear clinical picture.
- 50-79: Moderate confidence — several matching symptoms but some gaps or competing conditions.
- 0-49: Low confidence — limited info, major gaps, vague symptoms, or multiple equally plausible conditions.

Never increase confidence beyond what the data supports.
Explicitly state what information would most improve confidence.`;

export async function assessConfidence(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult,
  validation: ValidationResult | null,
  history: { role: string; content: string }[],
): Promise<ConfidenceAssessment | null> {
  const historyText = history.map((m) => `${m.role}: ${m.content}`).join("\n");

  const contents = `[SYMPTOM ANALYSIS]\n${JSON.stringify(analysis, null, 2)}\n[/SYMPTOM ANALYSIS]\n\n[DIFFERENTIAL DIAGNOSIS]\n${JSON.stringify(assessment, null, 2)}\n[/DIFFERENTIAL DIAGNOSIS]\n\n[VALIDATION ISSUES]\n${validation ? JSON.stringify(validation.issues, null, 2) : "none"}\n[/VALIDATION ISSUES]\n\n[CONVERSATION HISTORY]\n${historyText}\n[/CONVERSATION HISTORY]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIDENCE_TIMEOUT_MS);

  try {
    const result = await generateJSON<ConfidenceAssessment>({
      systemPrompt: CONFIDENCE_PROMPT,
      userContent: contents,
      temperature: 0.1,
      maxTokens: 1024,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[confidenceEngine] assessment failed:", message);
    return null;
  }
}

export function formatConfidenceContext(confidence: ConfidenceAssessment): string {
  const lines: string[] = [
    "<confidenceAssessment>",
    `  <overall>${confidence.overallConfidence}</overall>`,
    `  <score>${confidence.confidenceScore}</score>`,
    `  <remainingUncertainty>${confidence.remainingUncertainty}</remainingUncertainty>`,
  ];

  if (confidence.supportingFactors.length > 0) {
    lines.push("  <supportingFactors>");
    for (const f of confidence.supportingFactors) {
      lines.push(`    <factor>${f}</factor>`);
    }
    lines.push("  </supportingFactors>");
  }

  if (confidence.missingInformation.length > 0) {
    lines.push("  <missingInformation>");
    for (const m of confidence.missingInformation) {
      lines.push(`    <gap>${m}</gap>`);
    }
    lines.push("  </missingInformation>");
  }

  if (confidence.contradictions.length > 0) {
    lines.push("  <contradictions>");
    for (const c of confidence.contradictions) {
      lines.push(`    <contradiction>${c}</contradiction>`);
    }
    lines.push("  </contradictions>");
  }

  lines.push("</confidenceAssessment>");
  return lines.join("\n");
}
