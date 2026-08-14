import { TestResult, TestReport } from "../types";

export class RegressionReporter {
  generateReport(
    runId: string,
    suiteName: string,
    results: TestResult[],
    totalTime: number,
  ): TestReport {
    const totalTests = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = totalTests - passed;
    const warnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
    const hallucinationCount = results.reduce((sum, r) => sum + (r.hallucinationScore > 50 ? 1 : 0), 0);
    const safetyViolations = results.reduce((sum, r) => sum + r.safetyViolations, 0);
    const avgLatencyMs = results.length > 0 ? results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length : 0;
    const avgConfidence = results.length > 0 ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length : 0;

    return {
      runId,
      suiteName,
      timestamp: new Date(),
      totalTests,
      passed,
      failed,
      warnings,
      passRate: totalTests > 0 ? (passed / totalTests) * 100 : 0,
      hallucinationCount,
      safetyViolations,
      avgLatencyMs,
      avgConfidence,
      results,
    };
  }

  renderSummary(report: TestReport): string {
    const lines = [
      "╔══════════════════════════════════════════════════╗",
      "║         Regression Test Report Summary           ║",
      "╚══════════════════════════════════════════════════╝",
      "",
      `Suite: ${report.suiteName}`,
      `Run ID: ${report.runId}`,
      `Timestamp: ${report.timestamp.toISOString()}`,
      "",
      `Total Tests: ${report.totalTests}`,
      `Passed:      ${report.passed} (${report.passRate.toFixed(1)}%)`,
      `Failed:      ${report.failed}`,
      `Warnings:    ${report.warnings}`,
      "",
      `Hallucinations Detected: ${report.hallucinationCount}`,
      `Safety Violations:       ${report.safetyViolations}`,
      `Avg Latency:             ${report.avgLatencyMs.toFixed(0)}ms`,
      `Avg Confidence Score:    ${report.avgConfidence.toFixed(1)}%`,
      "",
      "═══════════════════════════════════════════════════",
    ];

    if (report.failed > 0) {
      lines.push("", "Failed Tests:", "");
      for (const result of report.results.filter((r) => !r.passed)) {
        lines.push(`  ✗ ${result.name} (${result.scenarioId})`);
        for (const warning of result.warnings) {
          lines.push(`    - ${warning}`);
        }
      }
    }

    return lines.join("\n");
  }

  renderDetail(report: TestReport): string {
    const lines = [this.renderSummary(report), ""];

    for (const result of report.results) {
      const status = result.passed ? "✓" : "✗";
      lines.push(
        "",
        `${status} ${result.name}`,
        `  Scenario: ${result.scenarioId}`,
        `  Hallucination Score: ${result.hallucinationScore}`,
        `  Quality Score:       ${result.qualityScore}`,
        `  Safety Violations:   ${result.safetyViolations}`,
        `  Latency:             ${result.latencyMs}ms`,
        `  Confidence:          ${result.confidence}%`,
      );

      for (const check of result.checks) {
        const checkStatus = check.passed ? "✓" : "✗";
        lines.push(`  ${checkStatus} ${check.message}`);
      }
    }

    return lines.join("\n");
  }
}
