import { registerAgent } from "./registry";
import { SymptomExtractionAgent } from "./agents/symptomExtraction";
import { ClinicalHistoryAgent } from "./agents/clinicalHistory";
import { DifferentialDiagnosisAgent } from "./agents/differentialDiagnosis";
import { RiskAssessmentAgent } from "./agents/riskAssessment";
import { MedicationSafetyAgent } from "./agents/medicationSafety";
import { LabRecommendationAgent } from "./agents/labRecommendation";
import { SelfCareRecoveryAgent } from "./agents/selfCareRecovery";
import { MedicalEvidenceAgent } from "./agents/medicalEvidence";
import { ReportGenerationAgent } from "./agents/reportGeneration";
import { FollowUpAgent } from "./agents/followUp";

// Register all agents
registerAgent(new SymptomExtractionAgent());
registerAgent(new ClinicalHistoryAgent());
registerAgent(new DifferentialDiagnosisAgent());
registerAgent(new RiskAssessmentAgent());
registerAgent(new MedicationSafetyAgent());
registerAgent(new LabRecommendationAgent());
registerAgent(new SelfCareRecoveryAgent());
registerAgent(new MedicalEvidenceAgent());
registerAgent(new ReportGenerationAgent());
registerAgent(new FollowUpAgent());

export { Orchestrator } from "./orchestrator";
export { ConsensusEngine } from "./consensusEngine";
export { ResponseGenerator } from "./responseGenerator";
export { ExecutionLogger } from "./executionLogger";
export { BaseAgent } from "./baseAgent";
export { registerAgent, getAgent, getAllAgents } from "./registry";
export { getPipeline, STANDARD_PIPELINE } from "./pipelineDefinition";
export { GroqProvider, OpenAIProvider, getLLMProvider, getAvailableProviders } from "./providers/llmProvider";

export type {
  AgentDefinition, AgentInput, AgentOutput, AgentContext,
  AgentConfig, AgentSchema,
  PipelineDefinition, PipelineStage, PipelineResult, PipelineError,
  ConsensusDecision, Disagreement,
  LLMProvider, LLMProviderConfig, LLMGenerateParams,
  PatientProfile, ExecutionLogEntry,
} from "./types";
