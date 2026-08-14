import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";

const REMEDY_TIMEOUT_MS = 12_000;

export interface HomeRemedy {
  condition: string;
  remedy: string;
  instructions: string;
  evidenceLevel: "established" | "traditional" | "anecdotal";
}

export interface TraditionalWellnessSuggestion {
  practice: string;
  purpose: string;
  preparation: string;
}

export interface RemedyPlan {
  homeRemedies: HomeRemedy[];
  traditionalWellness: TraditionalWellnessSuggestion[];
  safetyWarnings: string[];
  evidenceLevel: string;
  disclaimer: string;
}

const REMEDY_PROMPT = `You are an integrative medicine specialist. Generate safe, evidence-informed home remedies and traditional wellness suggestions personalized to the user's symptoms and clinical profile.

You will receive: symptom data, clinical profile (age, pregnancy, conditions), and differential diagnosis.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "homeRemedies": [
    {
      "condition": "Which symptom or condition this remedy addresses",
      "remedy": "The home remedy (e.g. warm salt-water gargle, honey, steam inhalation)",
      "instructions": "Brief how-to instructions (1 sentence, under 20 words)",
      "evidenceLevel": "established | traditional | anecdotal"
    }
  ],
  "traditionalWellness": [
    {
      "practice": "Name of traditional practice (e.g. Turmeric milk, Tulsi tea)",
      "purpose": "What it is traditionally used for",
      "preparation": "Brief preparation guidance"
    }
  ],
  "safetyWarnings": [
    "Specific safety warning for this user based on their profile"
  ],
  "evidenceLevel": "Overall evidence assessment: mostly well-established | mix of evidence and tradition | primarily traditional",
  "disclaimer": "Home remedies may help relieve mild symptoms but are not a substitute for professional medical care."
}

## Symptom-Specific Remedy Guidance

Sore throat:
- Warm salt-water gargle (1/2 tsp salt in warm water, gargle 3x daily) — established
- Warm fluids (herbal tea, warm water with honey) — established
- Honey (1 tsp as needed; NOT for children under 1 year due to botulism risk) — established
- Humidified air or steam — established

Cold / Nasal congestion:
- Steam inhalation (bowl of hot water, lean over with towel, 5-10 min) — established
- Saline nasal rinse or neti pot (use sterile/distilled water only) — established
- Warm fluids (broth, herbal tea) — established
- Adequate rest and hydration — established

Cough:
- Honey (1 tsp before bed for nighttime cough; NOT under 1 year) — established
- Warm ginger tea (steep fresh ginger in hot water 5-10 min) — established
- Humidifier or steam — established

Fever (mild):
- Adequate hydration (water, electrolyte fluids) — established
- Light clothing and light bedding — established
- Rest — established
- Lukewarm compress (NOT cold water or alcohol) — established

Indigestion / Stomach discomfort:
- Ginger tea (steep fresh ginger slices in hot water) — established
- Small frequent meals instead of large meals — established
- Avoid spicy, fatty, or greasy foods — established
- Cumin water (1 tsp cumin seeds in boiled water, steep 5 min) — traditional

Mild muscle pain / Body aches:
- Warm compress or heating pad — established
- Gentle stretching — established
- Epsom salt bath (1-2 cups in warm bath water, soak 15-20 min) — traditional
- Adequate hydration — established

Headache (mild):
- Rest in dark, quiet room — established
- Cold or warm compress on forehead — established
- Hydration — established
- Gentle neck and shoulder stretching — established

## Traditional Wellness Suggestions (label clearly)

When appropriate, include optional traditional wellness:
- Turmeric milk (1/2 tsp turmeric powder in warm milk; anti-inflammatory) — traditional
- Tulsi tea (holy basil leaves steeped in hot water; immune support) — traditional
- Ginger tea (fresh ginger in hot water; digestive aid, anti-nausea) — established
- Cumin water (cumin seeds in boiled water; digestive aid) — traditional
- Ajwain (carom seeds, chew a pinch or add to warm water; bloating) — traditional
- Warm herbal drinks (general comfort and hydration) — established

## Safety Rules (MANDATORY)

1. Infants under 1 year: NO honey (botulism risk). NO steam inhalation (burn risk).
2. Pregnancy: Avoid turmeric in medicinal amounts (can stimulate uterus). Avoid ajwain in medicinal amounts. Ginger in food amounts is safe but limit medicinal use. Warm salt-water gargle and honey are safe.
3. Severe illness: Do NOT recommend remedies that could delay seeking medical care.
4. Allergies: Check for known allergies before suggesting herbal/traditional remedies.
5. Chronic diseases: Avoid herbs that may interact with medications (e.g., turmeric is a blood thinner).
6. Emergency: If emergency is detected, return empty remedies and a safety warning only.
7. Evidence labeling: Mark remedies as "established" (supported by evidence), "traditional" (long history of use but limited studies), or "anecdotal" (based on experience, not studied).

Do NOT recommend:
- Any medication (prescription or OTC)
- Any treatment that could replace medical care
- Anything unsafe for the user's specific profile
- Herbal supplements in pill/extract form`;

export async function generateRemedyPlan(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  isEmergency: boolean,
): Promise<RemedyPlan | null> {
  if (isEmergency) {
    return {
      homeRemedies: [],
      traditionalWellness: [],
      safetyWarnings: ["Emergency symptoms detected. Do not rely on home remedies. Seek immediate medical attention."],
      evidenceLevel: "not applicable",
      disclaimer: "Home remedies may help relieve mild symptoms but are not a substitute for professional medical care.",
    };
  }

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
    conditions: assessment.conditions.map((c) => ({ name: c.name, confidence: c.confidence })),
  }, null, 2) : "not available"}\n[/DIFFERENTIAL DIAGNOSIS]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMEDY_TIMEOUT_MS);

  try {
    const result = await generateJSON<RemedyPlan>({
      systemPrompt: REMEDY_PROMPT,
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
    console.error("[remedyEngine] generation failed:", message);
    return null;
  }
}
