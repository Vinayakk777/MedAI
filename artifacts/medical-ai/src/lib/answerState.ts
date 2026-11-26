/**
 * Classifies an assistant message so the UI can present safety-critical
 * responses distinctly. The backend uses static, documented messages for
 * emergencies, safety fallbacks, and requests for more information; these
 * markers mirror those constants without changing the response contract.
 */

export type AnswerKind =
  | "answered"
  | "no_evidence"
  | "insufficient"
  | "safety_fallback"
  | "emergency"
  | "error";

const EMERGENCY_MARKERS = [
  "this sounds like it could be a medical emergency",
  "if you are in crisis, please reach out for help immediately",
  "this could be a choking emergency",
  "call your local emergency number",
  "go to the nearest emergency room immediately",
];

const SAFETY_FALLBACK_MARKERS = [
  "i'm unable to provide a validated response right now",
  "i'm unable to provide a response to this query as it triggered safety guidelines",
  "i apologize, but i cannot provide a response at this time",
];

const INSUFFICIENT_MARKERS = [
  "i appreciate you reaching out, but i need a bit more information",
  "could you please describe:",
  "more information to provide helpful guidance",
];

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ClassifyAnswerOptions {
  isError?: boolean;
  citationCount?: number;
}

/**
 * Order matters: safety short-circuits take precedence over generic
 * no-evidence messaging, and errors are never treated as answers.
 */
export function classifyAnswer(
  content: string,
  options: ClassifyAnswerOptions = {},
): AnswerKind {
  if (options.isError) return "error";

  const text = normalise(content);
  if (!text) return "answered";

  if (EMERGENCY_MARKERS.some((marker) => text.includes(marker))) {
    return "emergency";
  }

  if (SAFETY_FALLBACK_MARKERS.some((marker) => text.includes(marker))) {
    return "safety_fallback";
  }

  if (INSUFFICIENT_MARKERS.some((marker) => text.includes(marker))) {
    return "insufficient";
  }

  // Short greetings and clarifications should not be labelled as unsupported.
  if ((options.citationCount ?? 0) === 0 && content.trim().length >= 80) {
    return "no_evidence";
  }

  return "answered";
}
