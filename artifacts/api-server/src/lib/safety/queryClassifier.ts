interface RiskClassification {
  riskLevel: "low" | "medium" | "high_risk" | "emergency" | "insufficient";
  matchedPatterns: string[];
  shouldShortCircuit: boolean;
  shortCircuitMessage?: string;
  reason?: string;
}

const EMERGENCY_PATTERNS: Array<{ pattern: RegExp; reason: string; message: string }> = [
  { pattern: /\b(chest pain|heart attack|stroke|seizure|anaphyla|cannot breathe|stopped breathing|unconscious|overdose|poisoning|severe bleeding|suicid|self.?harm)\b/i, reason: "life-threatening symptom", message: "This sounds like it could be a medical emergency. Please call your local emergency number (911 in the US, 108 in India) or go to the nearest emergency room immediately. Do not wait for an online response." },
  { pattern: /\b(suicide|kill myself|end my life|want to die|no reason to live)\b/i, reason: "suicidal ideation", message: "If you are in crisis, please reach out for help immediately. Call or text 988 (Suicide & Crisis Lifeline in the US) or contact your local emergency services. You are not alone, and help is available." },
  { pattern: /\b(choking|can't swallow|airway blocked)\b/i, reason: "airway emergency", message: "This could be a choking emergency. If someone is choking, perform the Heimlich maneuver and call emergency services immediately." },
];

const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(medication|drug|dose|dosage|overdose|missed dose|interaction)\b/i, reason: "medication query" },
  { pattern: /\b(pregnant|pregnancy|trimester|fetus|breastfeeding)\b/i, reason: "pregnancy-related" },
  { pattern: /\b(child|infant|baby|newborn|pediatric)\b/i, reason: "pediatric query" },
  { pattern: /\b(elderly|senior|aged|geriatric)\b/i, reason: "elderly patient" },
  { pattern: /\b(surgery|surgical|operate|anaesthesia|anesthesia)\b/i, reason: "surgical inquiry" },
  { pattern: /\b(mental health|depression|anxiety|bipolar|schizophrenia|psychotic)\b/i, reason: "mental health" },
];

const INSUFFICIENT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(what do i have|what is wrong with me|diagnose me|do i have)\b/i, reason: "requesting self-diagnosis" },
  { pattern: /\b(should i take|which medication|what medicine|which drug)\b/i, reason: "requesting medication advice without context" },
];

export function classifyQueryRisk(query: string): RiskClassification {
  const matchedPatterns: string[] = [];

  for (const { pattern, reason, message } of EMERGENCY_PATTERNS) {
    if (pattern.test(query)) {
      matchedPatterns.push(reason);
      return {
        riskLevel: "emergency",
        matchedPatterns,
        shouldShortCircuit: true,
        shortCircuitMessage: message,
        reason,
      };
    }
  }

  for (const { pattern, reason } of HIGH_RISK_PATTERNS) {
    if (pattern.test(query)) {
      matchedPatterns.push(reason);
    }
  }

  if (matchedPatterns.length > 0) {
    return {
      riskLevel: "high_risk",
      matchedPatterns,
      shouldShortCircuit: false,
    };
  }

  for (const { pattern, reason } of INSUFFICIENT_PATTERNS) {
    if (pattern.test(query)) {
      matchedPatterns.push(reason);
    }
  }

  if (matchedPatterns.length > 0) {
    return {
      riskLevel: "insufficient",
      matchedPatterns,
      shouldShortCircuit: false,
      reason: matchedPatterns[0],
    };
  }

  return {
    riskLevel: "low",
    matchedPatterns: [],
    shouldShortCircuit: false,
  };
}

export function buildHighRiskPrefix(): string {
  return `[SAFETY INSTRUCTION] This query involves a high-risk medical topic. You MUST:
1. Use uncertainty language ("may," "could," "suggests," "possibly")
2. Never provide a definitive diagnosis
3. Always recommend consulting a healthcare professional
4. Include relevant disclaimers about seeking in-person medical advice
5. If medication-related, emphasize consulting a pharmacist or doctor

`;
}

export function buildInsufficientInfoResponse(query: string): string {
  return `I appreciate you reaching out, but I need a bit more information to provide helpful guidance.

Could you please describe:
- **Your main symptoms** — What are you experiencing?
- **When it started** — How long have you had these symptoms?
- **Severity** — On a scale of 1-10, how would you rate it?
- **Any other details** — Location, triggers, what makes it better or worse?

This will help me provide more relevant and safe guidance. Please remember, I can offer general health information but cannot replace a consultation with a healthcare professional.`;
}
