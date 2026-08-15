import { SafetyValidator, ValidationResult, SafetyContext } from "../types";

export class ClinicalSafetyValidator implements SafetyValidator {
  readonly name = "clinical_safety";
  readonly description = "Validates emergency handling, medication safety, age-aware recommendations";

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const lower = response.toLowerCase();

    // 1. Emergency conditions are never minimized
    results.push(this.checkEmergencyMinimization(lower, response, context));

    // 2. Dangerous symptoms trigger escalation
    results.push(this.checkDangerousSymptoms(lower, response, context));

    // 3. Medication advice is conservative
    results.push(this.checkMedicationSafety(lower, response, context));

    // 4. Pregnancy-specific guidance
    if (context.patientData?.pregnancy) {
      results.push(this.checkPregnancySafety(lower, response));
    }

    // 5. Pediatric guidance
    if (context.patientData?.isPediatric) {
      results.push(this.checkPediatricSafety(lower, response));
    }

    // 6. Elderly recommendations
    if (context.patientData?.isElderly) {
      results.push(this.checkElderlySafety(lower, response));
    }

    return results;
  }

  private checkEmergencyMinimization(lower: string, response: string, ctx: SafetyContext): ValidationResult {
    const emergencyPhrases = ["emergency", "911", "108", "call 911", "call 108", "go to the er", "emergency department",
      "immediate medical attention", "seek emergency care", "call emergency services"];

    const minimizingPhrases = ["don't worry", "it's probably nothing", "you'll be fine",
      "no need to worry", "just relax", "it's not serious", "don't panic"];

    const hasEmergency = emergencyPhrases.some((p) => lower.includes(p));
    const hasMinimizing = minimizingPhrases.some((p) => lower.includes(p));

    if (hasEmergency && hasMinimizing) {
      return {
        validatorName: this.name,
        status: "failed",
        severity: "critical",
        message: "Response contains emergency warnings alongside minimizing language. Emergency warnings must be clear and unambiguous.",
        details: { hasEmergency: true, hasMinimizing: true },
        suggestedAction: "rewrite",
      };
    }

    if (hasEmergency) {
      return {
        validatorName: this.name,
        status: "passed",
        severity: "info",
        message: "Emergency conditions properly flagged.",
        details: { emergencyPhrases: true },
        suggestedAction: "allow",
      };
    }

    return {
      validatorName: this.name,
      status: "passed",
      severity: "info",
      message: "No emergency conditions detected.",
      details: {},
      suggestedAction: "allow",
    };
  }

  private checkDangerousSymptoms(lower: string, response: string, ctx: SafetyContext): ValidationResult {
    const dangerousSymptoms = ["chest pain", "shortness of breath", "difficulty breathing",
      "severe bleeding", "unconscious", "stroke symptoms", "seizure",
      "head injury", "poisoning", "suicidal", "overdose", "severe allergic reaction"];

    const foundDangerous = dangerousSymptoms.filter((s) => lower.includes(s));
    // Any clear care-seeking or escalation language satisfies the guardrail —
    // not just literal "emergency/911" words. Otherwise perfectly safe advice
    // like "shortness of breath should be checked by a doctor" would be blocked.
    const hasEscalation = [
      "emergency", "call 911", "call 108", "immediate", "go to the er",
      "go to the emergency", "urgent care", "hospital", "er visit",
      "call your doctor", "call your physician", "call a doctor",
      "see a doctor", "see your doctor", "see a physician", "see your physician",
      "consult a doctor", "consult your doctor", "consult a physician",
      "consult your physician", "visit your doctor", "visit a doctor",
      "seek medical", "medical attention", "healthcare professional",
      "health care professional", "get checked", "be evaluated", "get evaluated",
    ].some((p) => lower.includes(p));

    if (foundDangerous.length > 0 && !hasEscalation) {
      return {
        validatorName: this.name,
        status: "failed",
        severity: "critical",
        message: `Dangerous symptom(s) detected without escalation: ${foundDangerous.join(", ")}`,
        details: { symptoms: foundDangerous, hasEscalation: false },
        triggerText: foundDangerous.join(", "),
        suggestedAction: "block",
      };
    }

    return {
      validatorName: this.name,
      status: "passed",
      severity: "info",
      message: "Dangerous symptoms properly handled.",
      details: { foundDangerous: foundDangerous.length },
      suggestedAction: "allow",
    };
  }

  private checkMedicationSafety(lower: string, response: string, ctx: SafetyContext): ValidationResult {
    const prescriptionPatterns = [
      { drug: "antibiotic", keywords: ["antibiotic", "amoxicillin", "azithromycin", "ciprofloxacin", "doxycycline"] },
      { drug: "steroid", keywords: ["prednisone", "corticosteroid", "dexamethasone", "hydrocortisone"] },
      { drug: "opioid", keywords: ["opioid", "oxycodone", "hydrocodone", "morphine", "tramadol", "codeine"] },
      { drug: "controlled", keywords: ["benzodiazepine", "diazepam", "alprazolam", "lorazepam", "zolpidem"] },
    ];

    const hasDisclaimer = lower.includes("consult your doctor") || lower.includes("consult a doctor") ||
      lower.includes("speak with your") || lower.includes("professional medical advice") ||
      lower.includes("not a substitute") || lower.includes("prescription");

    for (const category of prescriptionPatterns) {
      const found = category.keywords.filter((k) => lower.includes(k));
      if (found.length > 0 && !hasDisclaimer) {
        return {
          validatorName: this.name,
          status: "warning",
          severity: "high",
          message: `Prescription medication mentioned (${found.join(", ")}) without adequate safety disclaimer.`,
          details: { category: category.drug, found, hasDisclaimer: false },
          triggerText: found.join(", "),
          suggestedAction: "rewrite",
        };
      }
    }

    // Check for specific dosage recommendations
    const dosagePattern = /\d+\s*(mg|mcg|g|ml|tablet|capsule)/i;
    const hasDosage = dosagePattern.test(response);
    if (hasDosage && !hasDisclaimer) {
      return {
        validatorName: this.name,
        status: "warning",
        severity: "medium",
        message: "Specific medication dosages mentioned without adequate disclaimer.",
        details: { hasDosage: true, hasDisclaimer: false },
        suggestedAction: "rewrite",
      };
    }

    return {
      validatorName: this.name,
      status: "passed",
      severity: "info",
      message: "Medication advice is appropriately conservative.",
      details: {},
      suggestedAction: "allow",
    };
  }

  private checkPregnancySafety(lower: string, response: string): ValidationResult {
    const unsafeDrugs = ["ibuprofen", "advil", "motrin", "aspirin", "accutane", "isotretinoin",
      "warfarin", "coumarin", "tetracycline", "doxycycline", "valproic acid", "depakote"];
    const found = unsafeDrugs.filter((d) => lower.includes(d));

    if (found.length > 0) {
      return {
        validatorName: this.name,
        status: "failed",
        severity: "critical",
        message: `Potentially unsafe medication(s) mentioned for pregnant patient: ${found.join(", ")}`,
        details: { unsafeDrugs: found },
        triggerText: found.join(", "),
        suggestedAction: "block",
      };
    }

    if (!lower.includes("pregnant") && !lower.includes("pregnancy") && !lower.includes("your baby")) {
      return {
        validatorName: this.name,
        status: "warning",
        severity: "medium",
        message: "Response for pregnant patient does not acknowledge pregnancy status.",
        details: { pregnancyAcknowledged: false },
        suggestedAction: "rewrite",
      };
    }

    return {
      validatorName: this.name,
      status: "passed",
      severity: "info",
      message: "Pregnancy-appropriate guidance provided.",
      details: {},
      suggestedAction: "allow",
    };
  }

  private checkPediatricSafety(lower: string, response: string): ValidationResult {
    const adultDosagePattern = /\d+\s*(mg|mcg|g)\s+per\s+(adult|day|dose)/i;
    if (adultDosagePattern.test(response)) {
      return {
        validatorName: this.name,
        status: "failed",
        severity: "critical",
        message: "Response contains adult dosages for a pediatric patient.",
        details: {},
        suggestedAction: "block",
      };
    }

    const weightBasedTerm = lower.includes("weight") || lower.includes("per kg") || lower.includes("mg/kg");
    if (!weightBasedTerm && (lower.includes("dose") || lower.includes("dosage"))) {
      return {
        validatorName: this.name,
        status: "warning",
        severity: "high",
        message: "Pediatric medication guidance should include weight-based dosing information.",
        details: { weightBasedDosing: weightBasedTerm },
        suggestedAction: "rewrite",
      };
    }

    return {
      validatorName: this.name,
      status: "passed",
      severity: "info",
      message: "Pediatric guidance validated.",
      details: {},
      suggestedAction: "allow",
    };
  }

  private checkElderlySafety(lower: string, response: string): ValidationResult {
    const beersCriteria = ["diazepam", "amitriptyline", "cyclobenzaprine", "carisoprodol",
      "chlorpheniramine", "diphenhydramine", "benadryl", "nitrofurantoin", "digoxin"];
    const found = beersCriteria.filter((d) => lower.includes(d));

    if (found.length > 0) {
      return {
        validatorName: this.name,
        status: "failed",
        severity: "high",
        message: `Potentially inappropriate medication(s) for elderly (Beers Criteria): ${found.join(", ")}`,
        details: { beersCriteriaMedications: found },
        triggerText: found.join(", "),
        suggestedAction: "rewrite",
      };
    }

    return {
      validatorName: this.name,
      status: "passed",
      severity: "info",
      message: "Elderly patient guidance validated.",
      details: {},
      suggestedAction: "allow",
    };
  }
}
