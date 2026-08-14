import type { LLMProvider } from "../multi-agent/types";

// ─── Validation Result ───

export interface ValidationResult {
  validatorName: string;
  status: "passed" | "warning" | "failed";
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  details: Record<string, unknown>;
  triggerText?: string;
  score?: number; // 0-100
  suggestedAction: "allow" | "rewrite" | "block" | "fallback" | "warn";
}

// ─── Safety Evaluation ───

export interface SafetyEvaluation {
  id?: string;
  responseText: string;
  queryText: string;
  overallStatus: "passed" | "warning" | "failed" | "blocked";
  action: "allow" | "rewrite" | "block" | "fallback";
  fallbackMessage?: string;
  originalResponse?: string;
  results: ValidationResult[];
  scores: EvaluationScores;
  latencyMs: number;
}

export interface EvaluationScores {
  qualityScore: number;
  hallucinationScore: number;
  confidenceScore: number;
  clinicalRiskScore: number;
  evidenceCoverageScore: number;
  missingInformationScore: number;
  retrievalQualityScore: number;
}

// ─── Guardrail ───

export interface Guardrail {
  name: string;
  enabled: boolean;
  severity: "critical" | "high" | "medium" | "low";
  action: "block" | "rewrite" | "warn" | "log";
  threshold?: number;
}

// ─── Safety Config ───

export interface SafetyConfig {
  guardrails: Guardrail[];
  maxRetries: number;
  rewriteProvider?: string;
  rewriteModel?: string;
}

// ─── Validator Interface ───

export interface SafetyValidator {
  readonly name: string;
  readonly description: string;
  validate(response: string, context: SafetyContext): Promise<ValidationResult[]>;
}

export interface SafetyContext {
  userId: string;
  conversationId?: string;
  queryText: string;
  responseText?: string;
  patientData?: PatientContext;
  agentOutputs?: Record<string, any>;
  evidenceText?: string;
  retrievedChunks?: string[];
}

export interface PatientContext {
  age?: number;
  sex?: string;
  pregnancy?: boolean;
  isPediatric?: boolean;
  isElderly?: boolean;
  allergies?: string[];
  medications?: string[];
  chronicConditions?: string[];
}

// ─── Hallucination Event ───

export interface HallucinationEvent {
  category: string;
  claimText: string;
  evidenceAvailable: boolean;
  confidence: number;
  riskScore: number;
  details: Record<string, unknown>;
}

// ─── Regression Testing ───

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  category: string;
  patientMessage: string;
  history: { role: string; content: string }[];
  expectedChecks: ExpectedCheck[];
  patientData?: PatientContext;
}

export interface ExpectedCheck {
  type: "safety" | "hallucination" | "consistency" | "quality" | "latency" | "confidence";
  field: string;
  operator: "gte" | "lte" | "eq" | "contains" | "not_contains";
  value: number | string | boolean;
  description: string;
}

export interface TestResult {
  scenarioId: string;
  name: string;
  passed: boolean;
  checks: CheckResult[];
  hallucinationScore: number;
  qualityScore: number;
  safetyViolations: number;
  latencyMs: number;
  confidence: number;
  warnings: string[];
}

export interface CheckResult {
  type: string;
  field: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  message: string;
}

export interface TestReport {
  runId: string;
  suiteName: string;
  timestamp: Date;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  passRate: number;
  hallucinationCount: number;
  safetyViolations: number;
  avgLatencyMs: number;
  avgConfidence: number;
  results: TestResult[];
}

// ─── Quality Dimensions ───

export interface QualityDimensions {
  clinicalCompleteness: number;
  readability: number;
  terminologyBalance: number;
  userFriendliness: number;
  safety: number;
  transparency: number;
  actionability: number;
}

// ─── Prompt Injection Result ───

export interface PromptInjectionResult {
  isMalicious: boolean;
  category?: string;
  severity?: string;
  sanitizedInput?: string;
  action: "blocked" | "sanitized" | "allowed";
}
