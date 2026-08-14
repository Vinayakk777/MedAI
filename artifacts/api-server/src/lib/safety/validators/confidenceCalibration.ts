import { SafetyValidator, ValidationResult, SafetyContext } from "../types";

interface ConfidenceSignal {
  pattern: RegExp;
  weight: number; // positive = confident, negative = uncertain
  category: string;
}

export class ConfidenceCalibrator implements SafetyValidator {
  readonly name = "confidence_calibration";
  readonly description = "Evaluates AI response confidence vs. expressed uncertainty";

  private readonly signals: ConfidenceSignal[] = [
    // Strong uncertainty signals
    { pattern: /i(\'?\s*a)?m\s+not\s+(sure|certain|confident|qualified|an?\s+expert)/i, weight: -0.4, category: "uncertainty" },
    { pattern: /i don(\'?t| not) (know|understand|have that information)/i, weight: -0.3, category: "uncertainty" },
    { pattern: /this is (beyond|outside|not within) my (scope|expertise|knowledge|training)/i, weight: -0.5, category: "scope_acknowledgment" },
    { pattern: /it(\'?s|\s+is)\s+(important|essential|crucial)\s+to\s+consult/i, weight: -0.2, category: "disclaimer" },
    { pattern: /may (not\s+)?(be|apply|vary|differ|help|work)/i, weight: -0.1, category: "hedging" },
    { pattern: /could\s+(be|indicate|suggest|mean|result)/i, weight: -0.1, category: "hedging" },
    { pattern: /possibly|perhaps|might|maybe/i, weight: -0.1, category: "hedging" },
    { pattern: /check\s+with\s+(your\s+)?doctor|consult\s+(a\s+)?(professional|physician|specialist)/i, weight: -0.15, category: "disclaimer" },
    { pattern: /not\s+(medical|professional)\s+advice/i, weight: -0.2, category: "disclaimer" },
    { pattern: /seek\s+(professional|medical)\s+help/i, weight: -0.15, category: "disclaimer" },
    { pattern: /always\s+consult/i, weight: -0.2, category: "disclaimer" },
    { pattern: /please\s+note/i, weight: -0.05, category: "caveat" },
    { pattern: /it(\'?s|\s+is)\s+(unclear|uncertain|unknown|ambiguous|debatable)/i, weight: -0.3, category: "uncertainty" },
    { pattern: /your\s+(doctor|provider|physician)\s+((can|will)\s+)?(advise|recommend|determine|evaluate|assess)/i, weight: -0.15, category: "deferral" },

    // Overconfidence signals
    { pattern: /i (am|can)\s+(guarantee|assure|promise|vouch|confirm|ensure)/i, weight: 0.3, category: "overconfidence" },
    { pattern: /this\s+is\s+(definitely|certainly|absolutely|undoubtedly|indisputably|unquestionably)/i, weight: 0.3, category: "overconfidence" },
    { pattern: /there\s+is\s+no\s+doubt/i, weight: 0.4, category: "overconfidence" },
    { pattern: /100%\s+(sure|certain|confident|accurate|correct)/i, weight: 0.4, category: "overconfidence" },
    { pattern: /without\s+(a\s+)?doubt/i, weight: 0.3, category: "overconfidence" },
    { pattern: /it(\'?s|\s+is)\s+(guaranteed|certain|definite|proven)/i, weight: 0.3, category: "overconfidence" },
    { pattern: /(based\s+)?on\s+(my|our|the)\s+(knowledge|analysis|experience)\s*,\s*/i, weight: 0.1, category: "authority_claim" },
  ];

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const lower = response.toLowerCase();

    let totalWeight = 0;
    let uncertaintyCount = 0;
    let overconfidenceCount = 0;
    const signalDetails: string[] = [];

    for (const signal of this.signals) {
      if (signal.pattern.test(lower)) {
        totalWeight += signal.weight;
        signalDetails.push(`${signal.category}:${signal.weight}`);
        if (signal.weight < 0) uncertaintyCount++;
        else overconfidenceCount++;
      }
    }

    // Confidence score: 50 base + adjustment from signals, clamped 0-100
    const confidenceScore = Math.max(0, Math.min(100, 50 + totalWeight * 25));
    const status = confidenceScore > 80 ? "warning" : "passed";

    if (confidenceScore > 80 && overconfidenceCount > 0) {
      results.push({
        validatorName: this.name,
        status: "warning",
        severity: "medium",
        message: `Response may be overconfident (score: ${confidenceScore.toFixed(0)}). Medical advice should include appropriate uncertainty.`,
        details: {
          confidenceScore,
          uncertaintySignals: uncertaintyCount,
          overconfidenceSignals: overconfidenceCount,
          signals: signalDetails,
        },
        score: Math.round(confidenceScore),
        suggestedAction: "allow",
      });
    } else {
      results.push({
        validatorName: this.name,
        status: "passed",
        severity: "info",
        message: `Confidence calibration score: ${confidenceScore.toFixed(0)}/100`,
        details: {
          confidenceScore,
          uncertaintySignals: uncertaintyCount,
          overconfidenceSignals: overconfidenceCount,
          signals: signalDetails,
        },
        score: Math.round(confidenceScore),
        suggestedAction: "allow",
      });
    }

    return results;
  }
}
