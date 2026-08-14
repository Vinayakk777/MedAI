import { TestScenario, TestResult, CheckResult } from "../types";
import { SafetyFramework } from "../framework";

export class RegressionTestRunner {
  private framework: SafetyFramework;

  constructor(framework: SafetyFramework) {
    this.framework = framework;
  }

  async runScenario(scenario: TestScenario): Promise<TestResult> {
    const checkResults: CheckResult[] = [];
    const warnings: string[] = [];

    // Run the safety framework on the scenario
    const evaluation = await this.framework.evaluate(scenario.patientMessage, {
      userId: "regression_test_runner",
      queryText: scenario.patientMessage,
      patientData: scenario.patientData,
    });

    // Evaluate each expected check
    for (const check of scenario.expectedChecks) {
      const actual = this.extractField(evaluation, check.field);
      const passed = this.evaluateCheck(actual, check.operator, check.value);

      checkResults.push({
        type: check.type,
        field: check.field,
        expected: check.value,
        actual,
        passed,
        message: passed
          ? `Check passed: ${check.description}`
          : `Check failed: ${check.description} (expected: ${check.value}, got: ${actual})`,
      });

      if (!passed) {
        warnings.push(`${check.field}: expected ${check.operator} ${check.value}, got ${actual}`);
      }
    }

    return {
      scenarioId: scenario.id,
      name: scenario.name,
      passed: checkResults.every((c) => c.passed),
      checks: checkResults,
      hallucinationScore: evaluation.scores.hallucinationScore,
      qualityScore: evaluation.scores.qualityScore,
      safetyViolations: evaluation.results.filter((r) => r.status === "failed").length,
      latencyMs: evaluation.latencyMs,
      confidence: evaluation.scores.confidenceScore,
      warnings,
    };
  }

  async runSuite(scenarios: TestScenario[]): Promise<{
    results: TestResult[];
    totalTime: number;
  }> {
    const startTime = Date.now();

    const results: TestResult[] = [];
    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);
    }

    return {
      results,
      totalTime: Date.now() - startTime,
    };
  }

  private extractField(evaluation: any, field: string): any {
    // Dot notation: e.g., "scores.qualityScore" or "emergencyPhrases"
    const parts = field.split(".");
    let value = evaluation;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;

      // Check for boolean flags in results
      if (part === "emergencyPhrases") {
        return evaluation.results?.some(
          (r: any) => r.validatorName === "clinical_safety" && r.details?.emergencyPhrases,
        );
      }
      if (part === "minimizingLanguage") {
        return evaluation.results?.some(
          (r: any) => r.validatorName === "clinical_safety" && r.details?.hasMinimizing,
        );
      }
      if (part === "hasDisclaimer") {
        return evaluation.results?.some(
          (r: any) => r.validatorName === "clinical_safety" && r.details?.hasDisclaimer,
        );
      }
      if (part === "weightBasedDosing") {
        return evaluation.results?.some(
          (r: any) => r.validatorName === "clinical_safety" && r.details?.weightBasedDosing,
        );
      }
      if (part === "beersCriteriaViolation") {
        return evaluation.results?.some(
          (r: any) => r.validatorName === "clinical_safety" && r.details?.beersCriteriaMedications?.length > 0,
        );
      }
      if (part === "injectionDetected") {
        return evaluation.results?.some(
          (r: any) => r.validatorName === "prompt_injection" && r.status === "failed",
        );
      }
      if (part === "phiDetected") {
        return evaluation.results?.some(
          (r: any) => r.validatorName === "privacy_protection" && r.status === "failed",
        );
      }
      if (part === "contradictions") {
        return evaluation.results?.filter(
          (r: any) => r.validatorName === "medical_consistency" && r.status === "failed",
        ).length || 0;
      }
      if (part === "overconfidence") {
        return evaluation.results?.some(
          (r: any) => r.validatorName === "confidence_calibration" && r.status === "warning" && (r.score || 0) > 80,
        );
      }
      if (part === "empathy") {
        return evaluation.results?.filter(
          (r: any) => r.validatorName === "response_quality" && r.details?.dimension === "user_friendliness",
        ).length || 0;
      }
      if (part === "action") {
        return evaluation.action;
      }

      value = value[part];
    }

    return value;
  }

  private evaluateCheck(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case "gte":
        return typeof actual === "number" && typeof expected === "number" && actual >= expected;
      case "lte":
        return typeof actual === "number" && typeof expected === "number" && actual <= expected;
      case "eq":
        return actual === expected;
      case "contains":
        return typeof actual === "string" && actual.includes(String(expected));
      case "not_contains":
        return typeof actual === "string" && !actual.includes(String(expected));
      default:
        return false;
    }
  }
}
