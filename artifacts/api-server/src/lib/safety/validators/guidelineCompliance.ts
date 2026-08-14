import { SafetyValidator, ValidationResult, SafetyContext } from "../types";

interface MedicalGuideline {
  condition: RegExp;
  recommendation: RegExp;
  evidenceLevel: string;
  source: string;
  description: string;
  severity: "high" | "medium" | "low";
}

export class GuidelineComplianceChecker implements SafetyValidator {
  readonly name = "guideline_compliance";
  readonly description = "Validates responses against standard medical guidelines";

  private readonly guidelines: MedicalGuideline[] = [
    {
      condition: /heart\s+(attack|failure)|myocardial\s+infarction|coronary/i,
      recommendation: /emergency|call\s+911|call\s+108|immediate\s+(medical|care|attention)|aspirin/i,
      evidenceLevel: "A",
      source: "AHA/ACC Guidelines",
      description: "Suspected heart attack requires immediate emergency care",
      severity: "high",
    },
    {
      condition: /stroke|cerebrovascular|brain\s+attack|tia/i,
      recommendation: /emergency|call\s+911|call\s+108|facial\s+(droop|weakness)|arm\s+weakness|speech|time/i,
      evidenceLevel: "A",
      source: "AHA/ASA Guidelines",
      description: "Stroke symptoms require immediate emergency evaluation",
      severity: "high",
    },
    {
      condition: /anaphylaxis|severe\s+allergic\s+reaction|anaphylactic/i,
      recommendation: /epinephrine|epipen|emergency|call\s+911|call\s+108|immediate/i,
      evidenceLevel: "A",
      source: "AAAAI Guidelines",
      description: "Anaphylaxis requires epinephrine and emergency care",
      severity: "high",
    },
    {
      condition: /uti|urinary\s+tract\s+infection/i,
      recommendation: /doctor|physician|urinalysis|culture|antibiotic|medical/i,
      evidenceLevel: "B",
      source: "IDSA Guidelines",
      description: "UTI typically requires antibiotics and proper diagnosis",
      severity: "medium",
    },
    {
      condition: /pneumonia/i,
      recommendation: /chest\s+x.ray|antibiotic|hospitalization?|breathing\s+difficult/i,
      evidenceLevel: "A",
      source: "ATS/IDSA Guidelines",
      description: "Pneumonia diagnosis typically involves imaging and treatment",
      severity: "medium",
    },
    {
      condition: /depression|major\s+depressive/i,
      recommendation: /therapy|therapist|counseling|antidepressant|professional\s+help|psychiatrist|psychologist/i,
      evidenceLevel: "A",
      source: "APA Guidelines",
      description: "Depression treatment should involve professional mental healthcare",
      severity: "medium",
    },
    {
      condition: /diabetes\s+(type\s*2|mellitus)?/i,
      recommendation: /(blood\s+)?sugar\s+(monitoring|checking|control)|a1c|diet|exercise|medication/i,
      evidenceLevel: "A",
      source: "ADA Standards of Care",
      description: "Diabetes management requires monitoring and lifestyle management",
      severity: "low",
    },
    {
      condition: /hypertension|high\s+blood\s+pressure/i,
      recommendation: /monitoring?|medication|diet|exercis|sodium|lifestyle|doctor/i,
      evidenceLevel: "A",
      source: "ACC/AHA Guidelines",
      description: "Hypertension requires monitoring and risk factor management",
      severity: "low",
    },
    {
      condition: /asthma|wheezing|shortness\s+of\s+breath/i,
      recommendation: /inhaler|rescue|albuterol|controller|action\s+plan|pulmonologist|breathing\s+exercise/i,
      evidenceLevel: "A",
      source: "GINA Guidelines",
      description: "Asthma management includes rescue and controller therapy",
      severity: "medium",
    },
  ];

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const query = context.queryText.toLowerCase();
    const responseLower = response.toLowerCase();

    for (const guideline of this.guidelines) {
      const conditionMatch = guideline.condition.test(query) || guideline.condition.test(responseLower);
      if (!conditionMatch) continue;

      const recommendationMet = guideline.recommendation.test(responseLower);

      if (!recommendationMet) {
        results.push({
          validatorName: this.name,
          status: "warning",
          severity: guideline.severity,
          message: `Mismatch with ${guideline.source}: ${guideline.description}`,
          details: {
            condition: guideline.condition.source,
            expectedRecommendation: guideline.recommendation.source,
            evidenceLevel: guideline.evidenceLevel,
            source: guideline.source,
          },
          suggestedAction: guideline.severity === "high" ? "rewrite" : "allow",
        });
      }
    }

    if (results.length === 0) {
      results.push({
        validatorName: this.name,
        status: "passed",
        severity: "info",
        message: "No guideline compliance issues detected.",
        details: {},
        suggestedAction: "allow",
      });
    }

    return results;
  }
}
