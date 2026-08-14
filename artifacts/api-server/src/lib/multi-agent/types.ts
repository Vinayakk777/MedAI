// ─── Execution Context ───

export interface AgentContext {
  runId: string;
  userId: string;
  conversationId?: string;
  message: string;
  history: { role: string; content: string }[];
  patientData?: PatientProfile;
  agentOutputs: Map<string, AgentOutput>;
  metadata: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface PatientProfile {
  age?: number;
  sex?: string;
  pregnancy?: boolean;
  weightKg?: number;
  chronicConditions?: string[];
  allergies?: string[];
  medications?: string[];
}

// ─── Agent I/O ───

export interface AgentInput {
  message: string;
  history: { role: string; content: string }[];
  patientData?: PatientProfile;
  previousAgentOutputs?: Map<string, AgentOutput>;
  metadata?: Record<string, unknown>;
}

export interface AgentOutput {
  agentName: string;
  status: "success" | "error" | "skipped";
  data: Record<string, unknown>;
  confidence: number;
  summary: string;
  processingTimeMs: number;
  error?: string;
  retryCount: number;
}

export interface AgentSchema {
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

// ─── Agent Definition ───

export interface AgentDefinition {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly dependsOn: string[];
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly maxRetries: number;
  readonly timeoutMs: number;

  execute(input: AgentInput, context: AgentContext): Promise<AgentOutput>;
}

// ─── Pipeline ───

export interface PipelineDefinition {
  name: string;
  description: string;
  stages: PipelineStage[];
  parallelGroups?: string[][];
}

export interface PipelineStage {
  agentName: string;
  dependsOn: string[];
  optional: boolean;
  timeoutMs: number;
  maxRetries: number;
}

export interface PipelineResult {
  runId: string;
  pipelineName: string;
  status: "completed" | "failed" | "partial";
  totalDurationMs: number;
  agentResults: Map<string, AgentOutput>;
  consensusDecisions: ConsensusDecision[];
  responseContent?: string;
  errors: PipelineError[];
}

export interface PipelineError {
  agentName: string;
  error: string;
  retryCount: number;
  fatal: boolean;
}

// ─── Consensus ───

export interface ConsensusDecision {
  category: string;
  consensusText: string;
  confidence: number;
  agreementLevel: "unanimous" | "majority" | "partial" | "conflicting";
  contributingAgents: string[];
  dissentingAgents: string[];
  disagreements: Disagreement[];
}

export interface Disagreement {
  agents: string[];
  issue: string;
  positions: { agent: string; position: string }[];
  resolution: "resolved" | "unresolved";
}

// ─── LLM Provider ───

export interface LLMProviderConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly models: string[];
  generateJSON<T>(params: LLMGenerateParams): Promise<T | null>;
  generateText(params: LLMGenerateParams): Promise<string | null>;
  isAvailable(): boolean;
}

export interface LLMGenerateParams {
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  responseFormat?: "json" | "text";
}

// ─── Execution Log ───

export interface ExecutionLogEntry {
  pipelineRunId: string;
  userId: string;
  agentName: string;
  status: string;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  confidence: number;
  durationMs: number;
  retryCount: number;
  error?: string;
  llmProvider?: string;
  llmModel?: string;
  tokensUsed?: number;
}

// ─── Provider-Independent Agent Config ───

export interface AgentConfig {
  llmProvider?: string;
  llmModel?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  timeoutMs?: number;
}
