import { generateJSON } from "./aiClient";

const ANALYSIS_TIMEOUT_MS = 15_000;

export interface NormalizedSymptom {
  original: string;
  normalized: string;
  severity: "mild" | "moderate" | "severe" | "critical";
  duration?: string;
  bodyLocation?: string;
  progression?: string;
}

export interface ClinicalProfile {
  age?: string;
  gender?: string;
  medicalHistory?: string[];
  currentMedications?: string[];
}

export interface MissingInfo {
  category: string;
  detail: string;
  isCritical: boolean;
}

export interface SymptomAnalysis {
  primarySymptom: NormalizedSymptom;
  secondarySymptoms: NormalizedSymptom[];
  allSymptoms: NormalizedSymptom[];
  clinicalProfile: ClinicalProfile;
  missingInformation: MissingInfo[];
  emergencyFlags: string[];
  isEmergency: boolean;
  followUpQuestions: string[];
  confidence: "high" | "moderate" | "low";
  confidenceReason: string;
  assessmentReady: boolean;
}

const ANALYSIS_PROMPT = `You are a clinical reasoning engine. Your task is to analyze the user's messages through a structured 6-step process and output a single JSON object.

## Step 1 — Understand the User
Extract from the conversation:
- Primary symptom (the main complaint)
- Secondary symptoms (additional complaints)
- Duration of each symptom
- Severity of each symptom
- Body location
- Progression (getting better, worse, or staying the same)
- Age (if mentioned)
- Gender (if mentioned)
- Medical history (chronic diseases, surgeries, allergies — if mentioned)
- Current medications (if mentioned)

## Step 2 — Identify Missing Information
Determine what clinically important information is missing. Categories include: duration, temperature, pain score, recent travel, food intake, allergies, pregnancy, chronic diseases, symptom triggers, relieving factors.
- Mark isCritical: true if the missing information is essential for basic triage
- If critical information is missing, generate follow-up questions to ask before attempting assessment

## Step 3 — Normalize Symptoms
For each symptom the user mentions, convert their lay language into a standard medical term.
Example mapping: "my head hurts" → "headache", "my body is burning" → "fever", "I feel like throwing up" → "nausea"
Keep BOTH the original phrase and the normalized term. If a symptom is already medical terminology, use it as both original and normalized.

## Step 4 — Severity Classification
Classify each symptom into one of:
- mild: minor discomfort, doesn't interfere with daily activities
- moderate: noticeable discomfort, somewhat interferes with daily activities
- severe: intense discomfort, significantly interferes with daily activities
- critical: potentially life-threatening intensity

## Step 5 — Emergency Detection
Identify immediately dangerous symptoms. If ANY of these are present, set isEmergency to true and add specific flags:
- Chest pain or pressure
- Difficulty breathing or shortness of breath
- Stroke signs (facial drooping, arm weakness, speech difficulty)
- Loss of consciousness or fainting
- Severe allergic reaction (anaphylaxis)
- High fever in infants under 3 months
- Severe bleeding or hemorrhage
- Poisoning or overdose
- Suicidal thoughts or self-harm
- Severe head injury
- Severe abdominal pain with rigidity

## Step 6 — Confidence Estimation
Estimate confidence based on how much information is available:
- High: primary symptom + duration + severity + location + relevant missing info is minimal
- Moderate: primary symptom known but missing 1-2 important details
- Low: very little information, many gaps

## Output Schema
Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "primarySymptom": {
    "original": "user's exact words for the main symptom",
    "normalized": "standardized medical term",
    "severity": "mild|moderate|severe|critical",
    "duration": "duration string or omitted",
    "bodyLocation": "body location string or omitted",
    "progression": "worse|better|stable or omitted"
  },
  "secondarySymptoms": [
    {
      "original": "user's exact words",
      "normalized": "standardized medical term",
      "severity": "mild|moderate|severe|critical",
      "duration": "duration string or omitted",
      "bodyLocation": "body location string or omitted",
      "progression": "worse|better|stable or omitted"
    }
  ],
  "allSymptoms": [
    { same structure as above — include BOTH primary and secondary here }
  ],
  "clinicalProfile": {
    "age": "age string or omit",
    "gender": "gender string or omit",
    "medicalHistory": ["condition1", "condition2"] or omit,
    "currentMedications": ["med1", "med2"] or omit
  },
  "missingInformation": [
    { "category": "duration|temperature|painScore|travel|food|allergies|pregnancy|chronicDiseases|triggers|relievingFactors", "detail": "description of what's missing", "isCritical": true or false }
  ],
  "emergencyFlags": ["flag1", "flag2"],
  "isEmergency": true or false,
  "followUpQuestions": ["question1", "question2"],
  "confidence": "high|moderate|low",
  "confidenceReason": "brief explanation of confidence level",
  "assessmentReady": true or false
}

Strict rules:
- assessmentReady is true ONLY if: symptoms are extracted with severity AND duration AND relevant location, NO emergency flags, confidence is at least moderate, and no critical missing information.
- isEmergency must be true if ANY emergency flags are present; assessmentReady must be false in that case.
- If assessmentReady is false, generate 1-3 follow-up questions focused on the most critical missing information.
- Do NOT generate diagnoses, treatments, medications, or doctor recommendations.`;

function buildContents(
  history: { role: "user" | "assistant"; content: string }[],
  latestMessage: string,
) {
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of history) {
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  contents.push({ role: "user", parts: [{ text: latestMessage }] });
  return contents;
}

export async function analyzeSymptoms(
  history: { role: "user" | "assistant"; content: string }[],
  latestMessage: string,
): Promise<SymptomAnalysis> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  try {
    const result = await generateJSON<SymptomAnalysis>({
      systemPrompt: ANALYSIS_PROMPT,
      userContent: JSON.stringify(buildContents(history, latestMessage)),
      temperature: 0.1,
      maxTokens: 1024,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return result ?? emptyAnalysis();
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[symptomEngine] analysis failed:", message);
    return emptyAnalysis();
  }
}

function emptyAnalysis(): SymptomAnalysis {
  return {
    primarySymptom: { original: "", normalized: "", severity: "mild" },
    secondarySymptoms: [],
    allSymptoms: [],
    clinicalProfile: {},
    missingInformation: [],
    emergencyFlags: [],
    isEmergency: false,
    followUpQuestions: [],
    confidence: "low",
    confidenceReason: "No data extracted",
    assessmentReady: false,
  };
}

export function formatAnalysisContext(analysis: SymptomAnalysis): string {
  const parts: string[] = [];

  if (analysis.allSymptoms.length > 0) {
    parts.push("<symptoms>");
    for (const s of analysis.allSymptoms) {
      const fields = [`${s.normalized} (original: "${s.original}")`, `severity: ${s.severity}`];
      if (s.duration) fields.push(`duration: ${s.duration}`);
      if (s.bodyLocation) fields.push(`location: ${s.bodyLocation}`);
      if (s.progression) fields.push(`progression: ${s.progression}`);
      parts.push(`  - ${fields.join(", ")}`);
    }
    parts.push("</symptoms>");
  }

  if (analysis.primarySymptom?.normalized) {
    parts.push(`<primarySymptom>${analysis.primarySymptom.normalized}</primarySymptom>`);
  }

  if (analysis.clinicalProfile && Object.keys(analysis.clinicalProfile).length > 0) {
    parts.push("<clinicalProfile>");
    if (analysis.clinicalProfile.age) parts.push(`  - age: ${analysis.clinicalProfile.age}`);
    if (analysis.clinicalProfile.gender) parts.push(`  - gender: ${analysis.clinicalProfile.gender}`);
    if (analysis.clinicalProfile.medicalHistory?.length) parts.push(`  - medicalHistory: ${analysis.clinicalProfile.medicalHistory.join(", ")}`);
    if (analysis.clinicalProfile.currentMedications?.length) parts.push(`  - currentMedications: ${analysis.clinicalProfile.currentMedications.join(", ")}`);
    parts.push("</clinicalProfile>");
  }

  if (analysis.missingInformation.length > 0) {
    parts.push("<missingInformation>");
    for (const info of analysis.missingInformation) {
      parts.push(`  - [${info.isCritical ? "CRITICAL" : "optional"}] ${info.category}: ${info.detail}`);
    }
    parts.push("</missingInformation>");
  }

  if (analysis.emergencyFlags.length > 0) {
    parts.push("<emergencyFlags>");
    for (const flag of analysis.emergencyFlags) {
      parts.push(`  - ${flag}`);
    }
    parts.push("</emergencyFlags>");
  }

  if (analysis.followUpQuestions.length > 0) {
    parts.push("<followUpQuestions>");
    for (const q of analysis.followUpQuestions) {
      parts.push(`  - ${q}`);
    }
    parts.push("</followUpQuestions>");
  }

  parts.push(`<confidence>${analysis.confidence}</confidence>`);
  if (analysis.confidenceReason) parts.push(`<confidenceReason>${analysis.confidenceReason}</confidenceReason>`);
  parts.push(`<assessmentReady>${analysis.assessmentReady}</assessmentReady>`);
  if (analysis.isEmergency) parts.push(`<isEmergency>true</isEmergency>`);

  return parts.join("\n");
}
