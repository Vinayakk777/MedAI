// ─── Consultation Analytics ───

export interface ConsultationTelemetry {
  conversationId: string;
  userId: string;
  durationMs: number;
  followUpCount: number;
  tokensInput: number;
  tokensOutput: number;
  llmProvider: string;
  llmModel: string;
  responseLatencyMs: number;
  retrievalLatencyMs?: number;
  agentExecutionTimeMs?: number;
  safetyInterventions: number;
  safetyAction?: string;
  confidenceScore?: number;
  hallucinationScore?: number;
  qualityScore?: number;
  finalRiskCategory?: string;
  recommendationCategory?: string;
  retrievalSuccess?: boolean;
  chunksRetrieved?: number;
  hadEscalation: boolean;
  hadFallback: boolean;
  errorType?: string;
  errorMessage?: string;
}

// ─── Feedback ───

export interface UserFeedbackInput {
  conversationId: string;
  rating: "helpful" | "not_helpful";
  accuracyRating?: number;
  easeOfUnderstanding?: number;
  helpfulness?: number;
  trustLevel?: number;
  freeText?: string;
}

export interface DetectedPattern {
  pattern: string;
  label: string;
  frequency: number;
  lastSeen: Date;
}

// ─── Quality Metrics ───

export interface QualityMetricSnapshot {
  periodStart: Date;
  periodEnd: Date;
  resolution: "hourly" | "daily" | "weekly" | "monthly";
  avgConfidenceScore: number;
  avgHallucinationScore: number;
  avgQualityScore: number;
  hallucinationIncidents: number;
  safetyViolations: number;
  escalationFrequency: number;
  falseEmergencyAlerts: number;
  lowConfidenceResponses: number;
  modelFallbackCount: number;
  retrievalSuccessRate: number;
  avgResponseLatencyMs: number;
  activeUsers: number;
  totalConsultations: number;
  satisfactionScore: number;
}

// ─── Provider ───

export interface ProviderCallRecord {
  conversationId?: string;
  provider: string;
  model: string;
  taskType?: string;
  latencyMs: number;
  tokensInput: number;
  tokensOutput: number;
  success: boolean;
  errorType?: string;
  statusCode?: number;
}

export interface ProviderComparison {
  provider: string;
  model: string;
  totalCalls: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  failureRate: number;
  avgCostPerCall: number;
  avgUserSatisfaction?: number;
  avgQualityScore?: number;
  hallucinationRate?: number;
}

// ─── Prompt Versioning ───

export interface PromptVersionInput {
  name: string;
  content: string;
  description?: string;
  changeLog: string;
  author: string;
  tags?: string[];
  parentVersionId?: string;
}

export interface ABTestAssignment {
  userId: string;
  conversationId: string;
  promptName: string;
  variantA: number;
  variantB: number;
  assignedVariant: number;
}

// ─── Evaluation ───

export interface EvaluationScenario {
  id: string;
  name: string;
  query: string;
  expectedOutcome: string;
  category: string;
}

export interface EvaluationCheckResult {
  scenarioId: string;
  scenarioName?: string;
  passed: boolean;
  accuracyScore?: number;
  safetyScore?: number;
  consistencyScore?: number;
  followUpScore?: number;
  latencyMs?: number;
  errors?: string;
  details?: Record<string, unknown>;
}

// ─── Alerting ───

export interface AlertConfigInput {
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  windowMinutes?: number;
  cooldownMinutes?: number;
  severity?: string;
  channels?: string[];
  enabled?: boolean;
}

export interface AlertEventResult {
  configId: string;
  metric: string;
  metricValue: number;
  threshold: number;
  severity: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Auditing ───

export interface AuditLogInput {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// ─── Trend ───

export interface TrendPoint {
  date: string;
  value: number;
}

export interface TrendReport {
  daily: TrendPoint[];
  weekly: TrendPoint[];
  monthly: TrendPoint[];
}
