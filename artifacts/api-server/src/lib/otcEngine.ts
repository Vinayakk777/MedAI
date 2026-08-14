import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";

const OTC_TIMEOUT_MS = 14_000;

export interface OTCMedication {
  genericName: string;
  brandExamples: string[];
  purpose: string;
  adultDosage: string;
  maxDailyDose: string;
  commonSideEffects: string[];
  precautions: string[];
  contraindications: string[];
}

export interface OTCGuidance {
  recommendations: OTCMedication[];
  medicationWarnings: string[];
  contraindications: string[];
  followUpQuestions: string[];
  disclaimer: string;
}

const OTC_PROMPT = `You are a clinical pharmacology specialist. Generate safe, evidence-informed over-the-counter (OTC) medication guidance based on the user's symptoms and clinical profile.

You will receive:
1. Symptom data (symptoms, severity, duration)
2. Clinical profile (age, gender, medical history, current medications — if known)
3. Differential diagnosis (possible conditions)
4. Confidence assessment

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "recommendations": [
    {
      "genericName": "Generic medication name (e.g. paracetamol, ibuprofen, cetirizine)",
      "brandExamples": ["Common brand name 1", "Common brand name 2"],
      "purpose": "What symptom this medication addresses",
      "adultDosage": "Typical adult dosage (e.g. 500-1000mg every 4-6 hours as needed)",
      "maxDailyDose": "Maximum daily dose (e.g. 4000mg in 24 hours)",
      "commonSideEffects": ["Side effect 1", "Side effect 2"],
      "precautions": ["Precaution 1", "Precaution 2"],
      "contraindications": ["When NOT to use this medication"]
    }
  ],
  "medicationWarnings": [
    "Specific warnings for this user based on their profile"
  ],
  "contraindications": [
    "Conditions or situations where OTC medication should not be used"
  ],
  "followUpQuestions": [
    "Questions to ask before recommending medication — only if critical safety information is missing"
  ],
  "disclaimer": "Standard educational disclaimer"
}

## Symptom-Specific Guidance

Fever / Pain:
- Paracetamol (acetaminophen) — first-line for fever and mild-moderate pain
- Ibuprofen — for fever and pain when anti-inflammatory effect desired; avoid if asthma, stomach ulcers, kidney disease, or pregnancy (3rd trimester)
- Do NOT combine paracetamol and ibuprofen without medical advice

Cough:
- Dextromethorphan — for dry, hacking cough
- Guaifenesin — for productive cough with congestion
- Honey-based cough syrups — safe alternative
- Do NOT recommend cough suppressants for productive cough

Cold / Congestion:
- Saline nasal spray — safe for all ages
- Pseudoephedrine — for nasal congestion (behind pharmacy counter in some regions)
- Do NOT recommend decongestants if user has hypertension or heart disease

Sore throat:
- Lozenges with local anesthetics (benzocaine)
- Salt water gargle
- Do NOT recommend medicated lozenges for children under 5

Allergies:
- Cetirizine — non-drowsy antihistamine
- Loratadine — non-drowsy alternative
- Diphenhydramine — for severe symptoms, but causes drowsiness

Diarrhea:
- Oral rehydration solution (ORS) — first-line for all ages
- Loperamide — for non-infectious diarrhea only; NOT if fever, bloody stool, or suspected infection

Heartburn / Indigestion:
- Antacids (calcium carbonate, magnesium hydroxide)
- H2 blockers (famotidine)
- PPIs (omeprazole) — for short-term use only

## Medication Safety Rules (MANDATORY)

1. Known allergies: If user reports allergy to a medication class, do NOT recommend any medication in that class.
2. Pregnancy: If pregnant or possibly pregnant:
   - Avoid ibuprofen and other NSAIDs especially in 3rd trimester
   - Avoid decongestants
   - Paracetamol is preferred but use lowest effective dose
3. Asthma: Avoid ibuprofen and other NSAIDs in asthmatic users.
4. Liver disease: Avoid or limit paracetamol. Max dose 2000mg/day if any liver concerns.
5. Kidney disease: Avoid NSAIDs. Limit sodium content.
6. Stomach ulcers: Avoid NSAIDs.
7. Current medications: Check for interactions (e.g. avoid decongestants with MAOIs, avoid ibuprofen with anticoagulants).
8. Age restrictions: 
   - No aspirin for anyone under 18 (Reye's syndrome risk)
   - No medicated lozenges under 5
   - No decongestants under 6

If critical safety information is unknown (e.g., pregnancy status, allergies), generate followUpQuestions instead of recommending a potentially unsafe medication.

If NO medication is appropriate (e.g., emergency, symptoms don't warrant OTC, or too many safety concerns), return empty recommendations and explain why in medicationWarnings.

Do NOT recommend:
- Any prescription-only medications
- Antibiotics
- Steroids (oral or topical)
- Controlled substances
- Opioids (even OTC strength codeine where available)
- Herbal or unregulated supplements`;

export async function generateOTCGuidance(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  confidenceScore: number | null,
): Promise<OTCGuidance | null> {
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
  }, null, 2) : "not available"}\n[/DIFFERENTIAL DIAGNOSIS]\n\n[CONFIDENCE]\n${confidenceScore !== null ? `${confidenceScore}/100` : "not assessed"}\n[/CONFIDENCE]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OTC_TIMEOUT_MS);

  try {
    const result = await generateJSON<OTCGuidance>({
      systemPrompt: OTC_PROMPT,
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
    console.error("[otcEngine] generation failed:", message);
    return null;
  }
}
