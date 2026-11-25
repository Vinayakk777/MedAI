import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  createInitialState,
  getEffectiveDDx,
  type ConsultationState,
} from "../../src/lib/orchestrator";

function symptomAnalysis() {
  return {
    allSymptoms: [
      {
        normalized: "headache",
        severity: "moderate",
        duration: "2 days",
        bodyLocation: "head",
        progression: "stable",
      },
    ],
    primarySymptom: { normalized: "headache" },
    clinicalProfile: {
      age: 34,
      gender: "female",
      medicalHistory: ["migraine"],
      currentMedications: ["paracetamol"],
    },
    missingInformation: ["fever", "vision changes"],
    emergencyFlags: [],
    assessmentReady: true,
    followUpQuestions: [],
    isEmergency: false,
  } as any;
}

function assessment(name = "Tension headache") {
  return {
    summary: "A benign headache pattern.",
    conditions: [
      {
        name,
        confidence: 62,
        supportingSymptoms: ["headache"],
        missingSymptoms: ["fever"],
        warningSigns: ["sudden severe onset"],
      },
    ],
    confidenceStatement: "Possibly consistent with a tension headache.",
  } as any;
}

describe("createInitialState", () => {
  it("creates an empty consultation state with the latest message and history", () => {
    const state = createInitialState("I have a headache", [
      { role: "user", content: "hello" },
    ]);

    expect(state.latestMessage).toBe("I have a headache");
    expect(state.history).toEqual([{ role: "user", content: "hello" }]);
    expect(state.finalResponse).toBe("");
    for (const key of [
      "symptomAnalysis",
      "escalation",
      "followUp",
      "differentialDiagnosis",
      "validation",
      "confidence",
      "clinicalSummary",
      "selfCare",
      "otcGuidance",
      "remedyPlan",
      "recoveryPlan",
      "preventionPlan",
      "healthRiskScore",
      "careRecommendation",
      "laboratoryTests",
    ] as const) {
      expect(state[key]).toBeNull();
    }
  });
});

describe("buildSystemPrompt", () => {
  it("includes the base safety and disclaimer rules with no clinical data", () => {
    const prompt = buildSystemPrompt(createInitialState("What is a normal heart rate?", []));

    expect(prompt).toContain("You are MedAI");
    expect(prompt).toContain("Never claim certainty");
    expect(prompt).toContain("not a diagnosis");
    expect(prompt).not.toContain("[CLINICAL DATA START]");
  });

  it("injects structured symptom data", () => {
    const state = createInitialState("headache", []);
    state.symptomAnalysis = symptomAnalysis();

    const prompt = buildSystemPrompt(state);

    expect(prompt).toContain("[CLINICAL DATA START]");
    expect(prompt).toContain('"symptom": "headache"');
    expect(prompt).toContain('"primarySymptom": "headache"');
    expect(prompt).toContain("[CLINICAL DATA END]");
  });

  it("leads with an emergency warning and suppresses routine advice", () => {
    const state = createInitialState("crushing chest pain", []);
    state.escalation = {
      escalationLevel: "emergency",
      isEmergency: true,
      redFlags: [{ flag: "Chest pain", category: "cardiac" }],
      recommendedAction: "Call emergency services (911/108) now.",
    } as any;
    state.selfCare = { recommendations: [{ category: "x", recommendation: "rest", reasoning: "y" }] } as any;

    const prompt = buildSystemPrompt(state);

    expect(prompt).toContain("[EMERGENCY WARNING TO DELIVER]");
    expect(prompt).toContain("Chest pain");
    expect(prompt).toContain("Call emergency services");
    expect(prompt).toContain("Do NOT provide routine advice or assessment.");
    expect(prompt).not.toContain("[SELF-CARE PLAN START]");
  });

  it("uses the validated assessment over the raw differential diagnosis", () => {
    const state = createInitialState("headache", []);
    state.differentialDiagnosis = assessment("Raw diagnosis");
    state.validation = {
      validatedAssessment: assessment("Validated diagnosis"),
      issues: [],
    } as any;

    const prompt = buildSystemPrompt(state);

    expect(prompt).toContain("Validated diagnosis");
    expect(prompt).not.toContain("Raw diagnosis");
    expect(getEffectiveDDx(state)).toBe(state.validation!.validatedAssessment);
  });

  it("falls back to the raw differential diagnosis when validation is absent", () => {
    const state = createInitialState("headache", []);
    state.differentialDiagnosis = assessment("Raw diagnosis");

    expect(getEffectiveDDx(state)).toBe(state.differentialDiagnosis);
  });

  it("includes follow-up questions and confidence uncertainty", () => {
    const state = createInitialState("headache", []);
    state.followUp = {
      questions: [{ question: "Do you have a fever?", reason: "Rules out infection" }],
    } as any;
    state.confidence = {
      confidenceScore: 40,
      overallConfidence: "low",
      supportingFactors: ["stable pattern"],
      missingInformation: ["fever"],
      remainingUncertainty: "Needs more history.",
    } as any;

    const prompt = buildSystemPrompt(state);

    expect(prompt).toContain("[REQUIRED FOLLOW-UP QUESTIONS START]");
    expect(prompt).toContain("Do you have a fever?");
    expect(prompt).toContain("Score: 40/100 (low)");
    expect(prompt).toContain("Uncertainty: Needs more history.");
  });

  it("includes RAG evidence with anti-fabrication citation rules", () => {
    const state = createInitialState("headache", []);
    state.ragEvidence = "[MEDICAL EVIDENCE]\nSource: WHO\n- [HIGH] Headache guidance\n[/MEDICAL EVIDENCE]";

    const prompt = buildSystemPrompt(state);

    expect(prompt).toContain("[MEDICAL EVIDENCE]");
    expect(prompt).toContain("Cite sources by name");
    expect(prompt).toContain("Never fabricate a citation");
    expect(prompt).toContain("Never expose raw retrieved chunks to the user");
  });

  it("includes relevant patient memories when provided", () => {
    const state = createInitialState("headache", []);
    state.relevantMemories = "[RELEVANT MEDICAL MEMORY]\nPrior migraine diagnosis";

    expect(buildSystemPrompt(state)).toContain("Prior migraine diagnosis");
  });
});
