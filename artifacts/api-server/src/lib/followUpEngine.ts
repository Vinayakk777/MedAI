import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";

const FOLLOWUP_TIMEOUT_MS = 15_000;

export interface FollowUpQuestion {
  question: string;
  reason: string;
  priority: "critical" | "important" | "helpful";
}

export interface FollowUpResult {
  questions: FollowUpQuestion[];
  clinicalNote: string;
}

const FOLLOWUP_PROMPT = `You are a clinical follow-up question engine. Your job is to generate targeted questions that help distinguish between possible conditions.

You will receive structured symptom analysis data. Based on this data:

1. INTERNALLY reason about what conditions are possible given the reported symptoms (do not output these — only output questions).
2. Identify the most critical missing information that would change the differential diagnosis.
3. Generate 1-5 targeted follow-up questions that would most help distinguish between possible conditions.
4. Prioritize questions that have the highest clinical utility — i.e., the answers would most change your assessment.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "questions": [
    {
      "question": "A concise, natural-sounding question (under 20 words)",
      "reason": "Brief clinical rationale — why this question matters",
      "priority": "critical | important | helpful"
    }
  ],
  "clinicalNote": "A one-sentence note summarizing what clinical gap these questions address"
}

Rules:
- critical priority: missing information that could indicate an emergency or completely change the differential
- important priority: information that would meaningfully narrow the differential
- helpful priority: nice-to-have context that would improve confidence
- Questions must be conversational and natural — as if a doctor is asking.
- Do NOT ask questions already answered in the conversation history.
- Do NOT generate diagnoses, treatments, or recommendations.
- Do NOT ask more than 5 questions.`;

export async function generateFollowUpQuestions(
  analysis: SymptomAnalysis,
  history: { role: "user" | "assistant"; content: string }[],
  latestMessage: string,
): Promise<FollowUpResult | null> {
  const contents = `[SYMPTOM ANALYSIS DATA]\n${JSON.stringify(analysis, null, 2)}\n[/SYMPTOM ANALYSIS DATA]\n\n[CONVERSATION HISTORY]\n${history.map((m) => `${m.role}: ${m.content}`).join("\n")}\n[/CONVERSATION HISTORY]\n\n[LATEST MESSAGE]\n${latestMessage}\n[/LATEST MESSAGE]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FOLLOWUP_TIMEOUT_MS);

  try {
    const result = await generateJSON<FollowUpResult>({
      systemPrompt: FOLLOWUP_PROMPT,
      userContent: contents,
      temperature: 0.3,
      maxTokens: 1024,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[followUpEngine] generation failed:", message);
    return null;
  }
}

export function formatFollowUpContext(followUp: FollowUpResult): string {
  const lines: string[] = ["<followUpQuestions>"];
  for (const q of followUp.questions) {
    lines.push(`  <question priority="${q.priority}">`);
    lines.push(`    <text>${q.question}</text>`);
    lines.push(`    <reason>${q.reason}</reason>`);
    lines.push("  </question>");
  }
  lines.push("</followUpQuestions>");
  if (followUp.clinicalNote) {
    lines.push(`<clinicalNote>${followUp.clinicalNote}</clinicalNote>`);
  }
  return lines.join("\n");
}
