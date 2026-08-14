import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";

const SELFCARE_TIMEOUT_MS = 12_000;

export interface SelfCareRecommendation {
  category: "hydration" | "rest" | "nutrition" | "sleep" | "monitoring" | "lifestyle";
  recommendation: string;
  reasoning: string;
}

export interface SelfCarePlan {
  recommendations: SelfCareRecommendation[];
  monitoringAdvice: string[];
  recoveryAdvice: string[];
  lifestyleAdvice: string[];
}

const SELFCARE_PROMPT = `You are a self-care guidance specialist. Generate evidence-informed, personalized self-care recommendations based on the user's symptoms and clinical assessment.

You will receive:
1. Symptom data (what the user reported, severity, duration)
2. Differential diagnosis (possible conditions and confidence)
3. Confidence assessment (how certain the assessment is)

Generate recommendations that adapt to the specific symptoms. Never produce a generic fixed list.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "recommendations": [
    {
      "category": "hydration | rest | nutrition | sleep | monitoring | lifestyle",
      "recommendation": "A specific, actionable recommendation tailored to the user's symptoms",
      "reasoning": "Brief explanation of why this helps for their specific condition"
    }
  ],
  "monitoringAdvice": [
    "Specific symptom to watch for and what change should prompt re-evaluation"
  ],
  "recoveryAdvice": [
    "Practical recovery tip tailored to their symptoms and likely condition"
  ],
  "lifestyleAdvice": [
    "Lifestyle modification relevant to their symptoms (e.g. avoid alcohol with fever, avoid spicy food with stomach pain)"
  ]
}

Rules for personalization by symptom:

Cold / Sore throat: extra fluids, warm tea with honey, rest, soft foods, humidifier, avoid smoking.
Fever: hydration (water, electrolyte drinks), rest, light clothing, monitor temperature trends, avoid alcohol.
Cough: hydration, honey, steam inhalation, avoid cold air, sleep with head elevated.
Headache: rest in dark quiet room, hydration, identify triggers (screen time, skipped meals), regular sleep schedule.
Vomiting: small sips of clear fluids, oral rehydration solution, bland foods when ready (crackers, rice), avoid dairy/fatty/greasy.
Diarrhea: oral rehydration solution, BRAT diet (bananas, rice, applesauce, toast), avoid caffeine/dairy/fatty foods, probiotic-rich foods.
Fatigue: prioritize sleep, gentle activity if energy allows, consistent bedtime, avoid caffeine late in day.
Stomach pain after eating: small frequent meals, avoid trigger foods, keep food diary, eat slowly, avoid lying down after meals.
Body aches: gentle stretching, warm compress, rest, stay hydrated.
Mild injury: RICE (rest, ice, compression, elevation) if applicable, avoid aggravating activity.

General rules:
- Keep each recommendation under 25 words.
- Generate 3-6 recommendations total (not more).
- monitoringAdvice: 1-3 specific items to watch.
- recoveryAdvice: 1-2 practical recovery tips.
- lifestyleAdvice: 1-2 relevant lifestyle modifications.
- Do NOT recommend any medications, supplements, or over-the-counter drugs.
- Do NOT recommend seeing a specific type of doctor or specialist.
- If symptoms suggest a contagious condition (cold, flu, COVID), include advice about preventing spread.`;

export async function generateSelfCarePlan(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  confidenceScore: number | null,
): Promise<SelfCarePlan | null> {
  const contents = `[SYMPTOM DATA]\n${JSON.stringify({
    symptoms: analysis.allSymptoms.map((s) => ({
      original: s.original,
      normalized: s.normalized,
      severity: s.severity,
      duration: s.duration,
      location: s.bodyLocation,
    })),
    clinicalProfile: analysis.clinicalProfile,
    primarySymptom: analysis.primarySymptom?.normalized,
  }, null, 2)}\n[/SYMPTOM DATA]\n\n[DIFFERENTIAL DIAGNOSIS]\n${assessment ? JSON.stringify({
    conditions: assessment.conditions.map((c) => ({
      name: c.name,
      confidence: c.confidence,
    })),
  }, null, 2) : "not available"}\n[/DIFFERENTIAL DIAGNOSIS]\n\n[CONFIDENCE]\n${confidenceScore !== null ? `${confidenceScore}/100` : "not assessed"}\n[/CONFIDENCE]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SELFCARE_TIMEOUT_MS);

  try {
    const result = await generateJSON<SelfCarePlan>({
      systemPrompt: SELFCARE_PROMPT,
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
    console.error("[selfCareEngine] generation failed:", message);
    return null;
  }
}
