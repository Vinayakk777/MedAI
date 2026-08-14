import { PipelineDefinition } from "./types";

export const STANDARD_PIPELINE: PipelineDefinition = {
  name: "standard",
  description: "Standard medical consultation pipeline with sequential and parallel agent execution",
  stages: [
    // Sequential: symptom extraction first
    { agentName: "symptom_extraction",    dependsOn: [],              optional: false, timeoutMs: 14000, maxRetries: 2 },
    // Sequential: clinical history depends on symptoms
    { agentName: "clinical_history",      dependsOn: ["symptom_extraction"], optional: false, timeoutMs: 14000, maxRetries: 2 },
    // Parallel group 1: diagnosis, medication safety run in parallel after symptoms + history
    { agentName: "differential_diagnosis", dependsOn: ["symptom_extraction", "clinical_history"], optional: false, timeoutMs: 18000, maxRetries: 2 },
    { agentName: "risk_assessment",        dependsOn: ["symptom_extraction", "clinical_history", "differential_diagnosis"], optional: false, timeoutMs: 14000, maxRetries: 2 },
    { agentName: "medication_safety",      dependsOn: ["symptom_extraction", "clinical_history"], optional: true, timeoutMs: 14000, maxRetries: 2 },
    { agentName: "lab_recommendation",     dependsOn: ["symptom_extraction", "differential_diagnosis", "risk_assessment"], optional: true, timeoutMs: 14000, maxRetries: 2 },
    // Parallel group 2: self-care, evidence depend on diagnosis + risk
    { agentName: "self_care_recovery",     dependsOn: ["differential_diagnosis", "risk_assessment"], optional: true, timeoutMs: 14000, maxRetries: 2 },
    { agentName: "medical_evidence",       dependsOn: ["symptom_extraction", "differential_diagnosis"], optional: true, timeoutMs: 10000, maxRetries: 1 },
    // Sequential: follow-up depends on all clinical agents
    { agentName: "follow_up",             dependsOn: ["symptom_extraction", "clinical_history", "differential_diagnosis", "risk_assessment"], optional: true, timeoutMs: 14000, maxRetries: 2 },
    // Final: report generation
    { agentName: "report_generation",     dependsOn: [
      "symptom_extraction", "clinical_history", "differential_diagnosis",
      "risk_assessment", "medication_safety", "lab_recommendation",
      "self_care_recovery", "medical_evidence",
    ], optional: true, timeoutMs: 20000, maxRetries: 1 },
  ],
};

export function getPipeline(name: string): PipelineDefinition {
  if (name === "standard") return STANDARD_PIPELINE;
  return STANDARD_PIPELINE;
}
