import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";

const ESCALATION_TIMEOUT_MS = 12_000;

export type EscalationLevel = "routine" | "medical_review" | "urgent_care" | "emergency";

export interface RedFlag {
  category: string;
  flag: string;
  symptom: string;
}

export interface EscalationResult {
  isEmergency: boolean;
  escalationLevel: EscalationLevel;
  redFlags: RedFlag[];
  explanation: string;
  recommendedAction: string;
  stopAssessment: boolean;
}

const ESCALATION_PROMPT = `You are a red flag and emergency escalation engine. Your job is to evaluate symptoms for urgency and safety — prioritizing patient safety over completing a routine assessment.

You will receive structured symptom analysis data. Evaluate it against the following red flag categories:

## Cardiovascular Red Flags (Emergency)
- Chest pain with pressure, tightness, or crushing sensation
- Chest pain radiating to arm, jaw, neck, or back
- Sudden severe shortness of breath
- Chest pain with nausea, sweating, or dizziness

## Neurological Red Flags (Emergency)
- Sudden weakness or numbness on one side of the body
- Facial drooping
- Difficulty speaking or slurred speech
- Sudden confusion or disorientation
- Loss of consciousness or fainting
- New onset seizure
- Sudden severe headache ("worst headache of my life")
- Sudden vision changes or loss

## Respiratory Red Flags (Emergency)
- Severe difficulty breathing or gasping for air
- Blue lips or fingertips (cyanosis)
- Inability to speak in full sentences due to breathlessness
- Choking or airway obstruction

## Allergic Reaction Red Flags (Emergency)
- Swelling of the face, lips, tongue, or throat
- Difficulty breathing after known or possible allergen exposure
- Severe widespread hives with breathing difficulty
- Known anaphylaxis history with current exposure

## Infection/Sepsis Red Flags (Emergency)
- Very high fever (>103°F / 39.4°C) with confusion or lethargy
- Fever with stiff neck and severe headache
- Signs of sepsis: fever with rapid heart rate, rapid breathing, confusion, or extremely low blood pressure
- Fever in infants under 3 months

## Gastrointestinal Red Flags (Emergency)
- Vomiting blood or coffee-ground material
- Black or bloody stools
- Severe persistent abdominal pain with rigidity
- Inability to keep fluids down for more than 24 hours

## Pregnancy Red Flags (Emergency)
- Heavy vaginal bleeding during pregnancy
- Severe abdominal pain during pregnancy
- Seizure during pregnancy

## Mental Health Red Flags (Emergency)
- Statements indicating imminent self-harm or suicide
- Statements indicating immediate danger to others
- Hallucinations with command to harm self or others

## Urgent Care Red Flags (not immediate emergency but needs same-day care)
- Fever lasting more than 3 days in adults
- Moderate difficulty breathing (can still speak sentences)
- Severe pain not relieved by over-the-counter medication
- Large wounds or deep cuts
- Eye injury with vision changes
- Allergic reaction with hives but no breathing difficulty

## Medical Review Red Flags (should see a doctor within days)
- Persistent symptoms lasting more than a week
- Unexplained weight loss
- New persistent headache
- Low-grade fever persisting beyond 5 days

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "isEmergency": true or false,
  "escalationLevel": "routine | medical_review | urgent_care | emergency",
  "redFlags": [
    {
      "category": "cardiovascular | neurological | respiratory | allergic | infection | gastrointestinal | pregnancy | mental_health | urgent_care | medical_review",
      "flag": "the specific red flag triggered",
      "symptom": "the user-reported symptom that triggered this flag"
    }
  ],
  "explanation": "A brief explanation of why this escalation level was assigned",
  "recommendedAction": "What the user should do (e.g., call emergency services, go to urgent care, schedule a doctor visit)",
  "stopAssessment": true or false
}

Rules:
- If ANY Emergency red flag is triggered: isEmergency=true, escalationLevel="emergency", stopAssessment=true.
- If only Urgent Care red flags: isEmergency=false, escalationLevel="urgent_care", stopAssessment=false.
- If only Medical Review red flags: isEmergency=false, escalationLevel="medical_review", stopAssessment=false.
- If no red flags: isEmergency=false, escalationLevel="routine", stopAssessment=false.
- stopAssessment=true means the normal DDx and follow-up flow should be interrupted — only the emergency warning should be shown.
- Be thorough — missing a red flag is more dangerous than a false positive. When in doubt, escalate.`;

export async function evaluateEscalation(
  analysis: SymptomAnalysis,
  history: { role: string; content: string }[],
  latestMessage: string,
): Promise<EscalationResult | null> {
  const historyText = history.map((m) => `${m.role}: ${m.content}`).join("\n");

  const contents = `[SYMPTOM ANALYSIS]\n${JSON.stringify(analysis, null, 2)}\n[/SYMPTOM ANALYSIS]\n\n[CONVERSATION HISTORY]\n${historyText}\n[/CONVERSATION HISTORY]\n\n[LATEST MESSAGE]\n${latestMessage}\n[/LATEST MESSAGE]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ESCALATION_TIMEOUT_MS);

  try {
    const result = await generateJSON<EscalationResult>({
      systemPrompt: ESCALATION_PROMPT,
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
    console.error("[escalationEngine] evaluation failed:", message);
    return null;
  }
}

export function formatEscalationContext(escalation: EscalationResult): string {
  const lines: string[] = [
    "<escalation>",
    `  <level>${escalation.escalationLevel}</level>`,
    `  <explanation>${escalation.explanation}</explanation>`,
    `  <recommendedAction>${escalation.recommendedAction}</recommendedAction>`,
  ];

  if (escalation.redFlags.length > 0) {
    lines.push("  <redFlags>");
    for (const rf of escalation.redFlags) {
      lines.push(`    <redFlag category="${rf.category}">${rf.flag} (triggered by: "${rf.symptom}")</redFlag>`);
    }
    lines.push("  </redFlags>");
  }

  lines.push("</escalation>");
  return lines.join("\n");
}
