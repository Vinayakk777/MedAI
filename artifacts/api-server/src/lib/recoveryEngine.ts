import { generateJSON } from "./aiClient";
import type { SymptomAnalysis } from "./symptomEngine";
import type { AssessmentResult } from "./assessmentEngine";
import type { ConfidenceAssessment } from "./confidenceEngine";
import type { EscalationResult } from "./escalationEngine";

const RECOVERY_TIMEOUT_MS = 14_000;

export interface RecoveryTimelineEntry {
  condition: string;
  expectedDuration: string;
  symptomsImproveFirst: string[];
  symptomsPersistLonger: string[];
  milestones: { day: string; description: string }[];
}

export interface MonitoringItem {
  item: string;
  frequency: string;
  notes: string;
}

export interface FollowUpGuidance {
  condition: string;
  whenToSeekCare: string[];
}

export interface RecoveryPlan {
  recoveryTimelines: RecoveryTimelineEntry[];
  monitoringChecklist: MonitoringItem[];
  followUpAdvice: FollowUpGuidance[];
  dailyChecklist: string[];
  recoveryStatus: "excellent" | "good" | "moderate" | "uncertain";
  expectedRecoveryDays: string;
  disclaimer: string;
}

const RECOVERY_PROMPT = `You are a primary care physician specializing in recovery prognosis and patient monitoring. Generate personalized recovery timelines, monitoring checklists, and follow-up guidance based on the patient's symptoms, differential diagnosis, confidence, and escalation level.

You will receive: symptom data, clinical profile, differential diagnosis, confidence assessment (0-100), escalation level, and whether it's an emergency.

Output ONLY valid JSON (no markdown, no code fences, no extra text):
{
  "recoveryTimelines": [
    {
      "condition": "Condition name",
      "expectedDuration": "e.g. 7-10 days, 3-7 days, 24-72 hours, several hours to 2 days",
      "symptomsImproveFirst": ["Symptom that resolves earliest", "Next symptom"],
      "symptomsPersistLonger": ["Symptom that lingers", "Another lingering symptom"],
      "milestones": [
        { "day": "Day 1-2", "description": "What to expect in this window" },
        { "day": "Day 3-5", "description": "What to expect in this window" }
      ]
    }
  ],
  "monitoringChecklist": [
    {
      "item": "e.g. Temperature",
      "frequency": "e.g. Every 4-6 hours",
      "notes": "e.g. Seek care if > 103°F (39.4°C)"
    }
  ],
  "followUpAdvice": [
    {
      "condition": "Condition name",
      "whenToSeekCare": [
        "If fever lasts more than 3 days",
        "If symptoms worsen"
      ]
    }
  ],
  "dailyChecklist": [
    "☐ Drink enough fluids",
    "☐ Take adequate rest",
    "☐ Monitor temperature"
  ],
  "recoveryStatus": "excellent | good | moderate | uncertain",
  "expectedRecoveryDays": "e.g. 3-7 days, 7-10 days, 24-72 hours",
  "disclaimer": "Recovery timelines are estimates based on typical cases. Individual recovery may vary. If symptoms worsen or do not improve as expected, seek medical evaluation."
}

## Condition-Specific Recovery Knowledge

Common cold:
- Duration: 7-10 days
- Improves first: sore throat, sneezing
- Persists: cough, runny nose
- Milestones: Day 1-2 peak symptoms, Day 3-5 gradual improvement, Day 7-10 resolution

Viral fever / Flu:
- Duration: 3-7 days
- Improves first: fever, body aches
- Persists: fatigue, cough
- Milestones: Day 1-3 fever peak, Day 4-5 fever breaks, Day 5-7 energy returns

Bacterial sore throat (pharyngitis):
- Duration: 3-7 days with treatment, 5-10 days without
- Improves first: fever (if treated), throat pain
- Persists: mild soreness, swollen lymph nodes
- Milestones: Day 1-3 peak pain, Day 3-5 improvement begins

Food poisoning:
- Duration: 24-72 hours
- Improves first: vomiting, nausea
- Persists: loose stools, fatigue
- Milestones: First 6-12 hours acute phase, 12-24 hours improvement, 24-72 hours full recovery

Migraine:
- Duration: Several hours to 2 days
- Improves first: aura, nausea
- Persists: fatigue, sensitivity to light/sound
- Milestones: First 4-12 hours peak, 12-24 hours gradual relief, 24-48 hours full recovery

Allergic rhinitis:
- Duration: Days to weeks (varies with exposure)
- Improves first: sneezing, itchy eyes
- Persists: nasal congestion
- Milestones: 24-48 hours with antihistamines, 1-2 weeks without treatment

Acute sinusitis:
- Duration: 7-14 days
- Improves first: facial pain, fever
- Persists: nasal congestion, post-nasal drip
- Milestones: Day 3-5 peak symptoms, Day 5-7 improvement begins

Mild gastroenteritis:
- Duration: 24-72 hours
- Improves first: vomiting, nausea
- Persists: loose stools, abdominal cramps
- Milestones: First 12-24 hours acute, 24-48 hours improvement, 48-72 hours recovery

## Recovery Status Rules

- excellent: Mild symptoms, no risk factors, high confidence (80+), no escalation
- good: Moderate symptoms, low risk, moderate-high confidence (50-79), routine escalation
- moderate: Significant symptoms, some risk factors, low confidence (<50), medical_review escalation
- uncertain: Severe symptoms, multiple risk factors, contradictory findings, urgent_care escalation, or very low confidence

## Safety Rules

1. If emergency: skip all recovery estimates. Return empty arrays and set recoveryStatus to "uncertain" and expectedRecoveryDays to "seek emergency care".
2. Never guarantee recovery timing. Always use ranges.
3. For chronic conditions (migraine, allergies): note that recovery is episodic, not curative.
4. For pregnant patients: add appropriate monitoring items and avoid assumptions about medication-based recovery.
5. Monitoring items should be practical and non-invasive.
6. Follow-up advice must be specific to the condition and include concrete thresholds.`;

export async function generateRecoveryPlan(
  analysis: SymptomAnalysis,
  assessment: AssessmentResult | null,
  confidence: ConfidenceAssessment | null,
  escalation: EscalationResult | null,
): Promise<RecoveryPlan | null> {
  const isEmergency = escalation?.escalationLevel === "emergency";

  if (isEmergency) {
    return {
      recoveryTimelines: [],
      monitoringChecklist: [],
      followUpAdvice: [],
      dailyChecklist: [],
      recoveryStatus: "uncertain",
      expectedRecoveryDays: "seek emergency care",
      disclaimer: "Recovery timelines are estimates based on typical cases. Individual recovery may vary. If symptoms worsen or do not improve as expected, seek medical evaluation.",
    };
  }

  const contents = `[SYMPTOM DATA]\n${JSON.stringify({
    symptoms: analysis.allSymptoms.map((s) => ({
      original: s.original,
      normalized: s.normalized,
      severity: s.severity,
      duration: s.duration,
      progression: s.progression,
    })),
    clinicalProfile: analysis.clinicalProfile,
    primarySymptom: analysis.primarySymptom?.normalized,
  }, null, 2)}\n[/SYMPTOM DATA]\n\n[DIFFERENTIAL DIAGNOSIS]\n${assessment ? JSON.stringify({
    conditions: assessment.conditions.map((c) => ({
      name: c.name,
      confidence: c.confidence,
      urgency: c.warningSigns,
    })),
  }, null, 2) : "not available"}\n[/DIFFERENTIAL DIAGNOSIS]\n\n[CONFIDENCE]\nScore: ${confidence?.confidenceScore ?? "not available"}/100\nLevel: ${confidence?.overallConfidence ?? "not available"}\n[/CONFIDENCE]\n\n[ESCALATION]\nLevel: ${escalation?.escalationLevel ?? "routine"}\n[/ESCALATION]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RECOVERY_TIMEOUT_MS);

  try {
    const result = await generateJSON<RecoveryPlan>({
      systemPrompt: RECOVERY_PROMPT,
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
    console.error("[recoveryEngine] generation failed:", message);
    return null;
  }
}
