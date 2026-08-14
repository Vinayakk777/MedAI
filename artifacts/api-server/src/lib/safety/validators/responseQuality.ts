import { SafetyValidator, ValidationResult, SafetyContext, QualityDimensions } from "../types";

export class ResponseQualityEvaluator implements SafetyValidator {
  readonly name = "response_quality";
  readonly description = "Evaluates response quality across multiple dimensions";

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const dimensions = this.evaluateDimensions(response, context);
    const results: ValidationResult[] = [];

    // 1. Clinical Completeness
    results.push(this.createDimensionResult(
      "clinical_completeness",
      dimensions.clinicalCompleteness,
      "Response completeness for clinical context",
      dimensions.clinicalCompleteness < 40,
      dimensions.clinicalCompleteness < 60,
    ));

    // 2. Readability
    results.push(this.createDimensionResult(
      "readability",
      dimensions.readability,
      "Response readability and complexity level",
      dimensions.readability < 30,
      dimensions.readability < 50,
    ));

    // 3. User Friendliness
    results.push(this.createDimensionResult(
      "user_friendliness",
      dimensions.userFriendliness,
      "Patient-centered communication",
      false,
      dimensions.userFriendliness < 40,
    ));

    // 4. Safety
    results.push(this.createDimensionResult(
      "safety",
      dimensions.safety,
      "Safety consciousness in response",
      dimensions.safety < 30,
      dimensions.safety < 60,
    ));

    // 5. Transparency
    results.push(this.createDimensionResult(
      "transparency",
      dimensions.transparency,
      "Honesty about AI limitations",
      false,
      dimensions.transparency < 30,
    ));

    // 6. Actionability
    results.push(this.createDimensionResult(
      "actionability",
      dimensions.actionability,
      "Clear actionable guidance for patient",
      false,
      dimensions.actionability < 30,
    ));

    // 7. Overall quality
    const overallScore = this.calculateOverall(dimensions);
    results.push({
      validatorName: this.name,
      status: overallScore >= 60 ? "passed" : "warning",
      severity: overallScore >= 60 ? "info" : "medium",
      message: `Overall response quality: ${Math.round(overallScore)}/100`,
      details: { dimensions, overallScore },
      score: Math.round(overallScore),
      suggestedAction: overallScore >= 50 ? "allow" : "rewrite",
    });

    return results;
  }

  evaluateDimensions(response: string, context: SafetyContext): QualityDimensions {
    return {
      clinicalCompleteness: this.evalClinicalCompleteness(response, context),
      readability: this.evalReadability(response),
      terminologyBalance: this.evalTerminologyBalance(response),
      userFriendliness: this.evalUserFriendliness(response),
      safety: this.evalSafetyScore(response),
      transparency: this.evalTransparency(response),
      actionability: this.evalActionability(response),
    };
  }

  private evalClinicalCompleteness(response: string, context: SafetyContext): number {
    let score = 50; // base
    const lower = response.toLowerCase();

    // Adding detail signals
    const detailSignals = [
      "symptom", "cause", "treatment", "prevention", "when to see a doctor",
      "risk factor", "diagnosis", "complication", "prognosis", "follow.up",
    ];
    const found = detailSignals.filter((s) => lower.includes(s));
    score += found.length * 5;

    const hasEmergencyAwareness = /emergency|911|108|urgent|immediate/i.test(response);
    if (hasEmergencyAwareness) score += 5;

    // Redundancy / excessive length penalty
    const sentenceCount = (response.match(/[.!?]+/g) || []).length;
    const wordCount = response.split(/\s+/).length;
    if (sentenceCount > 15 && wordCount > 300) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  private evalReadability(response: string): number {
    const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;

    const words = response.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return 0;

    // Average words per sentence
    const avgWordsPerSentence = words.length / sentences.length;
    const idealSentenceLength = 15;

    // Syllable estimate (rough)
    const syllableCount = words.reduce((sum, w) => {
      const syllables = w.replace(/[aeiouy]{2,}/gi, "a").match(/[aeiouy]/gi);
      return sum + (syllables?.length || 1);
    }, 0);
    const avgSyllablesPerWord = syllableCount / words.length;

    // Score: inverse of complexity
    let score = 70;
    if (avgWordsPerSentence > 25) score -= 15;
    if (avgWordsPerSentence > 35) score -= 15;
    if (avgSyllablesPerWord > 2.0) score -= 10;
    if (avgSyllablesPerWord > 2.5) score -= 10;
    if (avgWordsPerSentence < 10) score += 5;

    // Bonus for short sentences
    const shortSentences = sentences.filter((s) => s.split(/\s+/).length <= 12).length;
    score += (shortSentences / sentences.length) * 10;

    return Math.max(0, Math.min(100, score));
  }

  private evalTerminologyBalance(response: string): number {
    const medicalTerms = [
      "diagnosis", "symptom", "treatment", "therapy", "medication", "dosage",
      "prescription", "chronic", "acute", "pathology", "etiology", "prognosis",
      "contraindication", "indication", "comorbidity", "syndrome",
    ];
    const lower = response.toLowerCase();
    const foundMedical = medicalTerms.filter((t) => lower.includes(t)).length;
    const wordCount = response.split(/\s+/).length;

    const medicalTermRatio = foundMedical / Math.max(1, wordCount / 50);

    // Ideal: 2-6 medical terms per 50 words
    if (medicalTermRatio < 1) return 30;
    if (medicalTermRatio < 2) return 50;
    if (medicalTermRatio <= 6) return 90;
    if (medicalTermRatio <= 10) return 60;
    return 30;
  }

  private evalUserFriendliness(response: string): number {
    let score = 50;
    const lower = response.toLowerCase();

    // Empathy signals
    const empathySignals = [
      "i understand", "i can imagine", "that sounds", "it's understandable",
      "you're not alone", "it's common", "many people", "i hear you",
      "that must be", "i appreciate",
    ];
    const empathyCount = empathySignals.filter((s) => lower.includes(s)).length;
    score += empathyCount * 8;

    // Addressing the user directly
    if (lower.includes("you") || lower.includes("your")) score += 10;

    // Supportive language
    const supportiveTerms = ["help", "support", "improve", "better", "available", "resource"];
    const supportiveCount = supportiveTerms.filter((t) => lower.includes(t)).length;
    score += supportiveCount * 3;

    // Excessive jargon penalty
    const jargonTerms = ["hereby", "aforesaid", "notwithstanding", "whereas", "henceforth"];
    const jargonCount = jargonTerms.filter((t) => lower.includes(t)).length;
    score -= jargonCount * 10;

    return Math.max(0, Math.min(100, score));
  }

  private evalSafetyScore(response: string): number {
    let score = 60;
    const lower = response.toLowerCase();

    // Positive safety signals
    const safetySignals = [
      "consult your", "seek medical", "emergency", "not a substitute",
      "professional advice", "see a doctor", "medical attention",
    ];
    const safetyCount = safetySignals.filter((s) => lower.includes(s)).length;
    score += safetyCount * 6;

    // Negative signals (overconfidence, minimizing)
    const riskSignals = [
      "definitely", "you'll be fine", "no need to worry", "guaranteed",
    ];
    const riskCount = riskSignals.filter((s) => lower.includes(s)).length;
    score -= riskCount * 12;

    return Math.max(0, Math.min(100, score));
  }

  private evalTransparency(response: string): number {
    let score = 40;
    const lower = response.toLowerCase();

    const transparencyPhrases = [
      "i am an ai", "ai assistant", "not a doctor", "not medical advice",
      "for informational purposes", "consult a", "professional",
      "cannot diagnose", "cannot prescribe",
    ];
    const found = transparencyPhrases.filter((p) => lower.includes(p)).length;
    score += found * 10;

    return Math.max(0, Math.min(100, score));
  }

  private evalActionability(response: string): number {
    let score = 40;
    const lower = response.toLowerCase();

    const actionPhrases = [
      "you should", "you can", "consider", "try", "start by", "begin with",
      "make an appointment", "schedule", "contact", "call", "visit",
      "steps?", "what to do", "next steps", "action",
    ];
    const found = actionPhrases.filter((p) => lower.includes(p)).length;
    score += found * 6;

    // Check for structured format
    if (/\d+\.\s/.test(response)) score += 10;
    if (/[-*]\s/.test(response)) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private calculateOverall(dimensions: QualityDimensions): number {
    return (
      dimensions.clinicalCompleteness * 0.20 +
      dimensions.readability * 0.15 +
      dimensions.terminologyBalance * 0.10 +
      dimensions.userFriendliness * 0.15 +
      dimensions.safety * 0.20 +
      dimensions.transparency * 0.10 +
      dimensions.actionability * 0.10
    );
  }

  private createDimensionResult(
    name: string,
    score: number,
    label: string,
    isFailed: boolean,
    isWarning: boolean,
  ): ValidationResult {
    return {
      validatorName: this.name,
      status: isFailed ? "failed" : isWarning ? "warning" : "passed",
      severity: isFailed ? "high" : isWarning ? "medium" : "info",
      message: `${label}: ${Math.round(score)}/100`,
      details: { dimension: name, score },
      score: Math.round(score),
      suggestedAction: isFailed ? "rewrite" : "allow",
    };
  }
}
