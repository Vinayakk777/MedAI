import { SafetyValidator, ValidationResult, SafetyContext } from "../types";

interface MedicalFact {
  pattern: RegExp;
  contradiction: RegExp;
  description: string;
  severity: "high" | "medium";
}

export class MedicalConsistencyChecker implements SafetyValidator {
  readonly name = "medical_consistency";
  readonly description = "Detects internal contradictions in medical responses";

  private readonly contradictionPairs: MedicalFact[] = [
    {
      pattern: /contagious/i,
      contradiction: /not\s+contagious|doesn\'?t\s+spread|can\'?t\s+be\s+passed/i,
      description: "Contagious vs not contagious contradiction",
      severity: "high",
    },
    {
      pattern: /should\s+(seek|visit|go\s+to\s+the)\s+(medical|doctor|physician|professional)/i,
      contradiction: /it(\'?s|\s+is)\s*(fine|nothing|not\s+serious|not\s+a\s+problem|no\s+worries)/i,
      description: "Seek help vs minimize contradiction",
      severity: "high",
    },
    {
      pattern: /don(\'?t| not)\s+(worry|panic|stress)/i,
      contradiction: /this is (serious|life.threatening|urgent|an emergency)/i,
      description: "Don't worry vs serious condition contradiction",
      severity: "medium",
    },
    {
      pattern: /\bavoid\s+(alcohol|caffeine|sugar|dairy|exercise|fatty.foods)/i,
      contradiction: /it(\'?s|\s+is)\s*(okay|fine|safe) to (drink|eat|consume|have)/i,
      description: "Avoid vs okay to consume contradiction",
      severity: "medium",
    },
    {
      pattern: /see your doctor if (symptoms|it|they) (persist|worsen|continue|don(\'?t| not) improve)/i,
      contradiction: /you(\'?ll|\s+will) be (fine|okay|better) in (no time|a (few|couple).days)/i,
      description: "See doctor vs dismissive reassurance contradiction",
      severity: "medium",
    },
    {
      pattern: /takes?\s+\d+\s*(to\s*)?\d*\s*(days|weeks|months)/i,
      contradiction: /immediate\s+(relief|improvement|results|benefit)|within\s+(minutes|hours)/i,
      description: "Treatment timeline vs immediate relief contradiction",
      severity: "medium",
    },
  ];

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const sentenceBoundary = /[.!?]+/g;
    const sentences = response.split(sentenceBoundary).filter((s) => s.trim().length > 0);

    let contradictionFound = false;

    for (const pair of this.contradictionPairs) {
      const affirmativeSentences: string[] = [];
      const negativeSentences: string[] = [];

      for (const sentence of sentences) {
        if (pair.pattern.test(sentence)) {
          affirmativeSentences.push(sentence.trim());
        }
        if (pair.contradiction.test(sentence)) {
          negativeSentences.push(sentence.trim());
        }
      }

      if (affirmativeSentences.length > 0 && negativeSentences.length > 0) {
        contradictionFound = true;
        results.push({
          validatorName: this.name,
          status: "failed",
          severity: pair.severity,
          message: `${pair.description}: "${affirmativeSentences[0].substring(0, 60)}..." vs "${negativeSentences[0].substring(0, 60)}..."`,
          details: {
            contradictionType: pair.description,
            affirmativeSentence: affirmativeSentences[0],
            negativeSentence: negativeSentences[0],
          },
          triggerText: affirmativeSentences[0],
          suggestedAction: "rewrite",
        });
      }
    }

    // Check for factual contradictions with evidence text
    if (context.evidenceText) {
      const evidenceLower = context.evidenceText.toLowerCase();
      const responseLower = response.toLowerCase();

      // Check numerical contradictions in evidence
      const numPattern = /(\d+[.,]?\d*)\s*(%|mg|ml|mcg|g|mm Hg|bpm|cm|kg)/g;
      const evidenceValues = new Map<string, string[]>();
      let m;
      while ((m = numPattern.exec(context.evidenceText)) !== null) {
        const key = m[2];
        if (!evidenceValues.has(key)) evidenceValues.set(key, []);
        evidenceValues.get(key)!.push(m[1]);
      }

      const responseValues = new Map<string, string[]>();
      numPattern.lastIndex = 0;
      while ((m = numPattern.exec(response)) !== null) {
        const key = m[2];
        if (!responseValues.has(key)) responseValues.set(key, []);
        responseValues.get(key)!.push(m[1]);
      }

      for (const [unit, evVals] of responseValues) {
        const evidenceVals = evidenceValues.get(unit);
        if (evidenceVals && evidenceVals.length > 0) {
          for (const respVal of evVals) {
            const respNum = parseFloat(respVal.replace(",", "."));
            const evNum = parseFloat(evidenceVals[0].replace(",", "."));
            if (evNum > 0 && Math.abs(respNum - evNum) / evNum > 0.5) {
              results.push({
                validatorName: this.name,
                status: "failed",
                severity: "high",
                message: `Numerical contradiction: response states ${respVal}${unit}, evidence states ${evidenceVals[0]}${unit} (${Math.abs(respNum - evNum) / evNum * 100}% difference)`,
                details: { responseValue: respVal + unit, evidenceValue: evidenceVals[0] + unit },
                triggerText: `${respVal}${unit}`,
                suggestedAction: "rewrite",
              });
              break;
            }
          }
        }
      }
    }

    if (!contradictionFound) {
      results.push({
        validatorName: this.name,
        status: "passed",
        severity: "info",
        message: "No medical contradictions detected.",
        details: {},
        suggestedAction: "allow",
      });
    }

    return results;
  }
}
