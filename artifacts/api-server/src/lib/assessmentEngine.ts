import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";

const ASSESSMENT_TIMEOUT_MS = 20_000;

export interface AssessmentCondition {
  name: string;
  confidence: "Low" | "Moderate" | "High";
  explanation: string;
  commonSymptoms: string[];
  supportingSymptoms: string[];
  missingSymptoms: string[];
  warningSigns: string[];
}

export interface AssessmentResult {
  summary: string;
  conditions: AssessmentCondition[];
  confidenceStatement: string;
}

const ASSESSMENT_PROMPT = `You are a differential diagnosis engine. Think like a clinician generating a ranked differential diagnosis.

Output ONLY valid JSON matching this schema (no markdown, no code fences, no extra text):
{
  "summary": "A 1-2 sentence summary of the primary complaint and clinical presentation",
  "conditions": [
    {
      "name": "Medical condition name",
      "confidence": "Low | Moderate | High",
      "explanation": "Explain why this condition is being considered — match the specific symptoms the user reported. If symptoms overlap with another condition on the list, explain why this one is more or less likely than the others.",
      "commonSymptoms": ["typical symptoms of this condition"],
      "supportingSymptoms": ["symptoms the user HAS that support this diagnosis"],
      "missingSymptoms": ["symptoms typically expected with this condition that the user has NOT reported or denied having"],
      "warningSigns": ["red-flag symptoms that if present would increase concern for this specific condition"]
    }
  ],
  "confidenceStatement": "A sentence explaining overall diagnostic confidence and what specific missing information would improve accuracy"
}

Strict clinical reasoning rules:

1. RANKING
- Generate exactly 5 conditions.
- Rank from MOST likely to LEAST likely based on symptom match.
- The top condition should be the one that best fits the reported symptom pattern.

2. COMPARATIVE REASONING
- When conditions share overlapping symptoms, explicitly explain why one is ranked above another.
- Example: "Viral URI is ranked above Influenza because the patient reports gradual onset and no body aches, which is more typical of URI."
- Address the differential explicitly — what rules each condition in or out.

3. SUPPORTING vs MISSING SYMPTOMS
- supportingSymptoms: which of the user's reported symptoms point TOWARD this condition.
- missingSymptoms: which expected symptoms are absent or unconfirmed. This is critical for showing clinical reasoning honesty. Example: if considering Strep throat but no fever reported, list "fever" in missingSymptoms.

4. CONFIDENCE
- High: strong symptom match with typical presentation and no major missing information.
- Moderate: plausible match but missing important details that could change the likelihood.
- Low: possible but many gaps or atypical presentation.
- Confidence must decrease when critical information is absent.

5. DISCLAIMERS
- NEVER claim certainty. Every condition is a possibility, not a diagnosis.
- If information is insufficient, explicitly state that more information is needed before confidence can increase.
- The confidenceStatement must mention what key missing data would most improve accuracy.

6. FORMAT
- Keep explanations concise (2-4 sentences each).
- warningSigns must be actual clinical red flags, not generic "see a doctor".
- Do NOT include medications, treatments, home remedies, or doctor recommendations.`;

function buildContents(
  history: { role: "user" | "assistant"; content: string }[],
  latestMessage: string,
  analysis: SymptomAnalysis,
) {
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [
    {
      role: "user",
      parts: [{ text: `[SYMPTOM ANALYSIS DATA]\n${JSON.stringify(analysis, null, 2)}\n[/SYMPTOM ANALYSIS DATA]` }],
    },
  ];
  for (const m of history) {
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  contents.push({ role: "user", parts: [{ text: latestMessage }] });
  return contents;
}

export async function generateAssessment(
  analysis: SymptomAnalysis,
  history: { role: "user" | "assistant"; content: string }[],
  latestMessage: string,
): Promise<AssessmentResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSESSMENT_TIMEOUT_MS);

  try {
    const result = await generateJSON<AssessmentResult>({
      systemPrompt: ASSESSMENT_PROMPT,
      userContent: JSON.stringify(buildContents(history, latestMessage, analysis)),
      temperature: 0.2,
      maxTokens: 2048,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[assessmentEngine] generation failed:", message);
    return null;
  }
}

export function formatAssessmentContext(assessment: AssessmentResult): string {
  const lines: string[] = ["<assessment>"];

  lines.push(`<summary>${assessment.summary}</summary>`);

  lines.push("<differentialDiagnosis>");
  for (let i = 0; i < assessment.conditions.length; i++) {
    const c = assessment.conditions[i];
    lines.push(`  <condition rank="${i + 1}">`);
    lines.push(`    <name>${c.name}</name>`);
    lines.push(`    <confidence>${c.confidence}</confidence>`);
    lines.push(`    <explanation>${c.explanation}</explanation>`);
    lines.push(`    <typicalSymptoms>${c.commonSymptoms.join(", ")}</typicalSymptoms>`);
    lines.push(`    <supportingSymptoms>${c.supportingSymptoms.join(", ")}</supportingSymptoms>`);
    lines.push(`    <missingSymptoms>${c.missingSymptoms.join(", ")}</missingSymptoms>`);
    lines.push(`    <warningSigns>${c.warningSigns.join(", ")}</warningSigns>`);
    lines.push("  </condition>");
  }
  lines.push("</differentialDiagnosis>");

  lines.push(`<confidenceStatement>${assessment.confidenceStatement}</confidenceStatement>`);
  lines.push("</assessment>");

  return lines.join("\n");
}
