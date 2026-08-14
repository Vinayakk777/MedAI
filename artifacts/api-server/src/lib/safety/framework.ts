import {
  SafetyValidator,
  SafetyContext,
  SafetyEvaluation,
  SafetyConfig,
  ValidationResult,
  EvaluationScores,
} from "./types";
import { ClinicalSafetyValidator } from "./validators/clinicalSafety";
import { HallucinationDetector } from "./validators/hallucinationDetector";
import { MedicalConsistencyChecker } from "./validators/medicalConsistency";
import { GuidelineComplianceChecker } from "./validators/guidelineCompliance";
import { PromptInjectionDefender } from "./validators/promptInjection";
import { PrivacyProtector } from "./validators/privacyProtection";
import { ConfidenceCalibrator } from "./validators/confidenceCalibration";
import { ResponseQualityEvaluator } from "./validators/responseQuality";
import { SafetyCache } from "./safetyCache";

const DEFAULT_CONFIG: SafetyConfig = {
  guardrails: [
    { name: "clinical_safety", enabled: true, severity: "critical", action: "block" },
    { name: "hallucination_detector", enabled: true, severity: "high", action: "rewrite" },
    { name: "medical_consistency", enabled: true, severity: "high", action: "rewrite" },
    { name: "guideline_compliance", enabled: true, severity: "medium", action: "warn" },
    { name: "prompt_injection", enabled: true, severity: "critical", action: "block" },
    { name: "privacy_protection", enabled: true, severity: "critical", action: "block" },
    { name: "confidence_calibration", enabled: true, severity: "low", action: "log" },
    { name: "response_quality", enabled: true, severity: "medium", action: "warn" },
  ],
  maxRetries: 2,
};

export class SafetyFramework {
  private validators: Map<string, SafetyValidator> = new Map();
  private config: SafetyConfig;
  private cache: SafetyCache;

  constructor(config?: Partial<SafetyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new SafetyCache();

    // Register default validators
    this.register(new ClinicalSafetyValidator());
    this.register(new HallucinationDetector());
    this.register(new MedicalConsistencyChecker());
    this.register(new GuidelineComplianceChecker());
    this.register(new PromptInjectionDefender());
    this.register(new PrivacyProtector());
    this.register(new ConfidenceCalibrator());
    this.register(new ResponseQualityEvaluator());
  }

  register(validator: SafetyValidator): void {
    this.validators.set(validator.name, validator);
  }

  unregister(name: string): void {
    this.validators.delete(name);
  }

  async evaluate(
    responseText: string,
    context: Omit<SafetyContext, "responseText">,
    forceReevaluate = false,
  ): Promise<SafetyEvaluation> {
    const startTime = Date.now();
    const contextWithResponse: SafetyContext = { ...context, responseText };

    // Check cache
    if (!forceReevaluate) {
      const cacheKey = this.cache.getKey(responseText, context.queryText);
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // Run all enabled validators
    const allResults: ValidationResult[] = [];

    for (const [name, validator] of this.validators) {
      const guardrail = this.config.guardrails.find((g) => g.name === name);
      if (!guardrail?.enabled) continue;

      try {
        const results = await validator.validate(responseText, contextWithResponse);
        allResults.push(...results);
      } catch (error) {
        allResults.push({
          validatorName: name,
          status: "failed",
          severity: "high",
          message: `Validator error: ${error instanceof Error ? error.message : "Unknown error"}`,
          details: { error },
          suggestedAction: "allow",
        });
      }
    }

    // Determine overall status and action
    const overallStatus = this.determineOverallStatus(allResults);
    const action = this.determineAction(allResults);
    const scores = this.calculateScores(allResults);

    // Blocking action: use fallback message
    let finalResponse = responseText;
    let fallbackMessage: string | undefined;

    if (action === "block") {
      fallbackMessage = this.buildFallbackMessage(allResults);
      finalResponse = fallbackMessage;
    }

    const evaluation: SafetyEvaluation = {
      responseText: finalResponse,
      queryText: context.queryText,
      overallStatus,
      action,
      fallbackMessage: action === "block" ? fallbackMessage : undefined,
      originalResponse: action === "block" ? responseText : undefined,
      results: allResults,
      scores,
      latencyMs: Date.now() - startTime,
    };

    // Cache the result
    const cacheKey = this.cache.getKey(responseText, context.queryText);
    this.cache.set(cacheKey, evaluation);

    return evaluation;
  }

  async evaluateWithRetry(
    responseText: string,
    context: Omit<SafetyContext, "responseText">,
    retryGenerate: (feedback: string) => Promise<string>,
  ): Promise<SafetyEvaluation> {
    let evaluation = await this.evaluate(responseText, context);

    let retries = 0;
    while (
      (evaluation.action === "rewrite" || evaluation.action === "block") &&
      retries < this.config.maxRetries
    ) {
      const feedback = this.buildRetryFeedback(evaluation.results);
      const rewrittenResponse = await retryGenerate(feedback);
      evaluation = await this.evaluate(rewrittenResponse, context, true);
      retries++;
    }

    return evaluation;
  }

  private determineOverallStatus(results: ValidationResult[]): "passed" | "warning" | "failed" | "blocked" {
    const criticalFailures = results.filter(
      (r) => r.status === "failed" && (r.severity === "critical" || r.severity === "high"),
    );
    const warnings = results.filter((r) => r.status === "warning");
    const blocked = results.filter(
      (r) => r.suggestedAction === "block" && r.status === "failed",
    );

    if (blocked.length > 0) return "blocked";
    if (criticalFailures.length > 0) return "failed";
    if (warnings.length > 0) return "warning";
    return "passed";
  }

  private determineAction(results: ValidationResult[]): "allow" | "rewrite" | "block" | "fallback" {
    const blocks = results.filter((r) => r.suggestedAction === "block" && r.status === "failed");
    const rewrites = results.filter((r) => r.suggestedAction === "rewrite" && r.status !== "passed");

    if (blocks.length > 0) return "block";
    if (rewrites.length > 0) return "rewrite";
    return "allow";
  }

  private calculateScores(results: ValidationResult[]): EvaluationScores {
    const scoreResults = results.filter((r) => r.score !== undefined);

    // Default scores
    const scores: EvaluationScores = {
      qualityScore: this.findScore(results, "response_quality", "overallScore"),
      hallucinationScore: this.findValidatorScore(results, "hallucination_detector"),
      confidenceScore: this.findValidatorScore(results, "confidence_calibration"),
      clinicalRiskScore: this.computeRiskScore(results, "clinical_safety"),
      evidenceCoverageScore: 50,
      missingInformationScore: 0,
      retrievalQualityScore: 50,
    };

    return scores;
  }

  private findScore(
    results: ValidationResult[],
    validatorName: string,
    dimension: string,
  ): number {
    const relevant = results.filter(
      (r) => r.validatorName === validatorName && r.details?.dimension === dimension,
    );
    if (relevant.length > 0) {
      const scores = relevant.map((r) => r.score ?? 50);
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    // Fallback: find any score from this validator
    const anyScore = results.find((r) => r.validatorName === validatorName && r.score !== undefined);
    return anyScore?.score ?? 50;
  }

  private findValidatorScore(results: ValidationResult[], validatorName: string): number {
    const relevant = results.filter((r) => r.validatorName === validatorName && r.score !== undefined);
    if (relevant.length > 0) {
      const scores = relevant.map((r) => r.score!);
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    // Invert status to score
    const passed = results.filter((r) => r.validatorName === validatorName && r.status === "passed");
    return passed.length > 0 ? 80 : 50;
  }

  private computeRiskScore(results: ValidationResult[], validatorName: string): number {
    const failed = results.filter(
      (r) => r.validatorName === validatorName && (r.status === "failed" || r.status === "warning"),
    );
    const baseRisk = failed.length * 20;
    const criticalCount = failed.filter((r) => r.severity === "critical" || r.severity === "high").length;
    return Math.min(100, baseRisk + criticalCount * 15);
  }

  private buildFallbackMessage(results: ValidationResult[]): string {
    const critical = results.filter((r) => r.status === "failed" && r.suggestedAction === "block");
    if (critical.length > 0) {
      return "I'm unable to provide a response to this query as it triggered safety guidelines. Please consult a qualified healthcare professional for medical advice.";
    }
    return "I apologize, but I cannot provide a response at this time. Please consult a healthcare professional.";
  }

  private buildRetryFeedback(results: ValidationResult[]): string {
    const issues = results
      .filter((r) => r.status !== "passed")
      .map((r) => `- ${r.message}`)
      .join("\n");
    return `The previous response had safety/quality concerns:\n${issues}\n\nPlease revise the response to address these concerns while maintaining medical accuracy.`;
  }
}
