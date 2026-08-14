import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { ClinicalProfile } from "./symptomEngine";

const PREVENTION_TIMEOUT_MS = 14_000;

export interface LifestyleRecommendation {
  category: "hydration" | "nutrition" | "physical_activity" | "sleep" | "stress" | "hygiene" | "respiratory_hygiene" | "smoking" | "alcohol" | "weight";
  recommendation: string;
  reasoning: string;
}

export interface HealthEducation {
  conditionName: string;
  whatIsIt: string;
  commonCauses: string[];
  typicalSymptoms: string[];
  expectedRecovery: string;
  preventionTips: string[];
}

export interface PreventionStrategy {
  condition: string;
  strategies: string[];
}

export interface PreventionPlan {
  lifestyleRecommendations: LifestyleRecommendation[];
  healthEducation: HealthEducation[];
  preventionStrategies: PreventionStrategy[];
  wellnessTips: string[];
  preventiveCareSuggestions: string[];
  disclaimer: string;
}

const PREVENTION_PROMPT = `You are a preventive medicine and public health specialist. Generate personalized prevention recommendations, lifestyle coaching, and health education based on the user's symptoms, clinical profile, and differential diagnosis.

You will receive: symptom data, clinical profile (age, pregnancy, conditions, lifestyle), and differential diagnosis.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "lifestyleRecommendations": [
    {
      "category": "hydration | nutrition | physical_activity | sleep | stress | hygiene | respiratory_hygiene | smoking | alcohol | weight",
      "recommendation": "Specific actionable advice",
      "reasoning": "Why this recommendation is relevant to their current condition"
    }
  ],
  "healthEducation": [
    {
      "conditionName": "Name of the condition",
      "whatIsIt": "Simple 1-2 sentence explanation in patient-friendly language",
      "commonCauses": ["Cause 1", "Cause 2"],
      "typicalSymptoms": ["Symptom 1", "Symptom 2"],
      "expectedRecovery": "Typical recovery outlook",
      "preventionTips": ["Tip 1", "Tip 2"]
    }
  ],
  "preventionStrategies": [
    {
      "condition": "Condition name",
      "strategies": ["Strategy 1", "Strategy 2", "Strategy 3"]
    }
  ],
  "wellnessTips": ["Tip 1", "Tip 2", "Tip 3", "Tip 4", "Tip 5"],
  "preventiveCareSuggestions": ["Suggestion 1", "Suggestion 2"],
  "disclaimer": "These are general health recommendations and not a substitute for professional medical advice. Always consult a healthcare provider for personalized preventive care."
}

## Condition-Specific Prevention Knowledge

Common cold:
- Wash hands regularly with soap and water
- Avoid close contact with sick individuals
- Do not touch face with unwashed hands
- Disinfect frequently touched surfaces
- Maintain adequate sleep and hydration

Food poisoning / Gastroenteritis:
- Practice safe food handling (cook thoroughly, wash produce)
- Drink clean, treated water
- Refrigerate perishable foods within 2 hours
- Wash hands before eating and after restroom use
- Avoid raw or undercooked eggs, meat, and seafood

Migraine:
- Maintain consistent sleep schedule
- Stay well hydrated
- Identify and avoid personal triggers (certain foods, lights, stress)
- Manage stress through relaxation techniques
- Keep a headache diary

Seasonal allergies:
- Reduce allergen exposure during peak seasons
- Keep windows closed on high pollen days
- Shower and change clothes after outdoor exposure
- Use air purifiers with HEPA filters
- Rinse sinuses with saline spray

Sore throat / Pharyngitis:
- Practice good hand hygiene
- Avoid sharing utensils or drinking glasses
- Stay hydrated to keep throat moist
- Use a humidifier in dry environments
- Avoid smoking and secondhand smoke

Fever / Viral illness:
- Stay home and rest to prevent spread
- Practice respiratory hygiene (cover coughs and sneezes)
- Wash hands frequently
- Disinfect shared surfaces
- Maintain good nutrition to support immune function

Diarrhea / GI upset:
- Practice rigorous hand hygiene
- Drink only treated or boiled water
- Avoid dairy and heavy foods during recovery
- Gradually reintroduce solid foods
- Consider probiotics (food-based, e.g., yogurt)

## Lifestyle Recommendations Rules

Only include categories that are relevant to the user's condition and profile.

Hydration: Always relevant for fever, diarrhea, vomiting, or any acute illness.
Nutrition: Relevant for GI issues, recovery from illness, general wellness.
Physical activity: Recommend light activity during recovery. Recommend rest during acute phase. Never recommend exercise during fever or acute illness.
Sleep: Always relevant during illness recovery. Emphasize rest for viral/bacterial infections.
Stress: Relevant for headaches, migraines, chronic conditions, and general wellness.
Hygiene: Relevant for contagious conditions (cold, flu, sore throat, diarrhea).
Respiratory hygiene: Relevant for respiratory symptoms (cough, cold, sore throat).
Smoking: Only if smoking is indicated in clinical profile.
Alcohol: Advise avoiding alcohol during acute illness and recovery.
Weight: Only if weight management is relevant to the condition or indicated in profile.

## Vaccination & Screening

Suggest discussing preventive care with a healthcare professional when relevant:
- Routine vaccinations (flu shot, etc.) — only if seasonally or conditionally appropriate
- Age-appropriate screenings
- Chronic disease monitoring

Do NOT recommend specific vaccine brands or non-routine vaccines unless directly relevant.

## Safety

- Never provide lifestyle advice that conflicts with emergency guidance.
- If the user has a fever or acute infection: recommend rest, not exercise.
- For pregnancy: adjust recommendations to be pregnancy-safe.
- For children: adjust language and recommendations to be age-appropriate.
- For chronic conditions: avoid advice that could interfere with existing treatment.`;

export async function generatePreventionPlan(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  clinicalProfile: ClinicalProfile | null,
  isEmergency: boolean,
): Promise<PreventionPlan | null> {
  if (isEmergency) {
    return {
      lifestyleRecommendations: [],
      healthEducation: [],
      preventionStrategies: [],
      wellnessTips: [],
      preventiveCareSuggestions: [],
      disclaimer: "These are general health recommendations and not a substitute for professional medical advice. Always consult a healthcare provider for personalized preventive care.",
    };
  }

  const contents = `[SYMPTOM DATA]\n${JSON.stringify({
    symptoms: analysis.allSymptoms.map((s) => ({
      original: s.original,
      normalized: s.normalized,
      severity: s.severity,
      duration: s.duration,
    })),
    clinicalProfile: clinicalProfile || analysis.clinicalProfile,
    primarySymptom: analysis.primarySymptom?.normalized,
  }, null, 2)}\n[/SYMPTOM DATA]\n\n[DIFFERENTIAL DIAGNOSIS]\n${assessment ? JSON.stringify({
    conditions: assessment.conditions.map((c) => ({
      name: c.name,
      confidence: c.confidence,
    })),
    summary: assessment.summary,
  }, null, 2) : "not available"}\n[/DIFFERENTIAL DIAGNOSIS]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREVENTION_TIMEOUT_MS);

  try {
    const result = await generateJSON<PreventionPlan>({
      systemPrompt: PREVENTION_PROMPT,
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
    console.error("[preventionEngine] generation failed:", message);
    return null;
  }
}
