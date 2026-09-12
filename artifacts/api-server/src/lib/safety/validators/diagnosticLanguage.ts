import { SafetyValidator, ValidationResult, SafetyContext } from "../types";

const DEFINITIVE_DIAGNOSIS_PATTERNS = [
  /you have\s+(cancer|diabetes|heart disease|a?ids|leukemia|lymphoma|tumor)/i,
  /you are\s+(diabetic|pregnant|hiv positive)/i,
  /this is\s+(cancer|a?ids|leukemia|lymphoma|a tumor|heart failure)/i,
  /diagnos(is|ed|ing)\s+you/i,
  /confirmed?\s+(diagnosis|condition)/i,
  /definitely\s+(have|has|is)/i,
  /without a doubt\s+(you|this)/i,
];

const UNCERTAINTY_PATTERNS = [
  /\bmay\b/, /\bmight\b/, /\bcould\b/, /\bpossibly\b/,
  /\bpotentially\b/, /\bsuggests?\b/, /\bconsistent with\b/,
  /\bcommonly associated\b/, /\bone possibility\b/,
  /\bconsider\b/, /\bwarrants evaluation\b/,
];

export class DiagnosticLanguageValidator implements SafetyValidator {
  readonly name = "diagnostic_language";
  readonly description = "Ensures responses avoid definitive diagnoses and use appropriate uncertainty language";

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const pattern of DEFINITIVE_DIAGNOSIS_PATTERNS) {
      const match = response.match(pattern);
      if (match) {
        results.push({
          validatorName: this.name,
          status: "failed",
          severity: "high",
          message: `Response uses definitive diagnostic language: "${match[0]}"`,
          details: { matchedPattern: match[0] },
          triggerText: match[0],
          score: 0,
          suggestedAction: "rewrite",
        });
      }
    }

    if (results.length === 0) {
      const hasUncertainty = UNCERTAINTY_PATTERNS.some((p) => p.test(response));
      results.push({
        validatorName: this.name,
        status: hasUncertainty ? "passed" : "warning",
        severity: "medium",
        message: hasUncertainty
          ? "Response appropriately uses uncertainty language"
          : "Response lacks uncertainty language; consider adding qualifying statements",
        details: { hasUncertaintyLanguage: hasUncertainty },
        score: hasUncertainty ? 100 : 60,
        suggestedAction: hasUncertainty ? "allow" : "warn",
      });
    }

    return results;
  }
}
