import { SafetyValidator, ValidationResult, SafetyContext } from "../types";

interface PHIPattern {
  pattern: RegExp;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
}

export class PrivacyProtector implements SafetyValidator {
  readonly name = "privacy_protection";
  readonly description = "Detects Protected Health Information (PHI) in responses";

  private readonly phiPatterns: PHIPattern[] = [
    { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, category: "ssn", severity: "critical", description: "Social Security Number" },
    { pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, category: "phone", severity: "high", description: "Phone Number" },
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, category: "email", severity: "high", description: "Email Address" },
    { pattern: /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/, category: "credit_card", severity: "critical", description: "Credit Card Number" },
    { pattern: /\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b/, category: "ssn_formatted", severity: "critical", description: "Formatted SSN" },
    { pattern: /\b\d{5}(-\d{4})?\b/, category: "zip", severity: "low", description: "Zip Code (potential location exposure)" },
    { pattern: /\b(?:patient|client)\s+(?:name|id|number|identifier)[:\s]*[A-Za-z0-9]+/i, category: "patient_id", severity: "critical", description: "Patient identifier exposure" },
  ];

  // Medical context terms that can accompany PHI
  private readonly medicalContextTerms = /\b(diagnosis|condition|treatment|medication|symptom|surgery|allergy|lab\s*result|blood\s*test)\s*[:\s]/i;

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const entry of this.phiPatterns) {
      const matches = response.match(entry.pattern);
      if (matches) {
        // Check if PHI is in medical context (higher risk)
        const inMedicalContext = this.medicalContextTerms.test(response);

        results.push({
          validatorName: this.name,
          status: "failed",
          severity: entry.severity,
          message: `Potential PHI detected: ${entry.description} (${matches.length} occurrence(s))`,
          details: {
            category: entry.category,
            matchCount: matches.length,
            inMedicalContext,
          },
          triggerText: matches[0],
          suggestedAction: "block",
        });
      }
    }

    // Check for personal health info patterns
    const healthPatterns = [
      { pattern: /\b(?:height|weight|bmi|blood\s*pressure|heart\s*rate|temperature)\s*[:\s]*\d+/i, category: "vitals", severity: "medium" },
      { pattern: /\b(?:diagnosis|condition)[:\s]["']?[A-Za-z\s]+["']?/i, category: "diagnosis", severity: "medium" },
    ];

    for (const entry of healthPatterns) {
      const matches = response.match(entry.pattern);
      if (matches && !context.patientData) {
        results.push({
          validatorName: this.name,
          status: "warning",
          severity: entry.severity as "critical" | "high" | "medium",
          message: `Personal health data pattern detected without patient context`,
          details: { category: entry.category },
          triggerText: matches[0],
          suggestedAction: "warn",
        });
      }
    }

    if (results.length === 0) {
      results.push({
        validatorName: this.name,
        status: "passed",
        severity: "info",
        message: "No PHI detected in response.",
        details: {},
        suggestedAction: "allow",
      });
    }

    return results;
  }
}
