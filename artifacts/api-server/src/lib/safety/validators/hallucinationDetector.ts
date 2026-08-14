import { SafetyValidator, ValidationResult, SafetyContext, HallucinationEvent } from "../types";

export class HallucinationDetector implements SafetyValidator {
  readonly name = "hallucination_detector";
  readonly description = "Detects fabricated medical facts, false citations, and unsupported claims";

  private readonly knownValues = new Map<string, RegExp[]>([
    ["fda_approved_drugs", [/fda\s+(approved|cleared)\s+(the\s+)?drug/i, /fda\s+(approved|cleared)\s+(the\s+)?medication/i]],
    ["normal_ranges", [/normal\s+(blood\s+)?(pressure|sugar|glucose)\s+(is|range|level).*\d+/i,
      /normal\s+(heart|pulse)\s+rate/i, /normal\s+(body\s+)?temperature/i]],
    ["mortality_rates", [/\d+%\s+(mortality|survival|death)\s+rate/i, /survival\s+rate\s+of\s+\d+/i]],
  ]);

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const events = this.detectHallucinations(response, context);

    if (events.length > 0) {
      for (const event of events) {
        results.push({
          validatorName: this.name,
          status: event.riskScore > 0.7 ? "failed" : "warning",
          severity: event.riskScore > 0.8 ? "critical" : event.riskScore > 0.6 ? "high" : "medium",
          message: `Hallucination risk: ${event.category} - "${event.claimText?.substring(0, 100)}"`,
          details: { ...event, context },
          triggerText: event.claimText,
          score: Math.round((1 - event.riskScore) * 100),
          suggestedAction: event.riskScore > 0.7 ? "rewrite" : "allow",
        });
      }
    }

    if (results.length === 0) {
      results.push({
        validatorName: this.name,
        status: "passed",
        severity: "info",
        message: "No hallucination patterns detected.",
        details: {},
        suggestedAction: "allow",
      });
    }

    return results;
  }

  detectHallucinations(response: string, context: SafetyContext): HallucinationEvent[] {
    const events: HallucinationEvent[] = [];
    const lower = response.toLowerCase();
    const evidence = (context.evidenceText || "").toLowerCase();

    // 1. Unsupported statistical claims
    const statsPattern = /(exactly|precisely|specifically)\s+(\d+\.?\d*)\s*%/g;
    let match;
    while ((match = statsPattern.exec(response)) !== null) {
      events.push({
        category: "fabricated_fact",
        claimText: match[0],
        evidenceAvailable: evidence.includes(`${match[2]}%`),
        confidence: 0.3,
        riskScore: 0.5,
        details: { precision: match[2], type: "statistical_claim" },
      });
    }

    // 2. "Studies show" without evidence
    const studyPatterns = [
      /studies\s+(show|suggest|indicate|demonstrate|find|reveal)\s+that/i,
      /research\s+(shows|suggests|indicates|demonstrates|finds)/i,
      /according\s+to\s+(studies|research)/i,
    ];

    for (const pattern of studyPatterns) {
      if (pattern.test(lower)) {
        const hasCitation = /\d{4}/.test(response) || /\[[\d,\s]+\]/.test(response);
        if (!hasCitation && !evidence) {
          events.push({
            category: "unsupported_claim",
            claimText: response.match(pattern)?.[0] || "studies claim",
            evidenceAvailable: false,
            confidence: 0.4,
            riskScore: 0.55,
            details: { pattern: pattern.source, hasCitation: false, hasEvidence: !!evidence },
          });
        }
      }
    }

    // 3. False drug names (common hallucination pattern)
    const drugMentionPattern = /\b([A-Z][a-z]+(?:[-\s][A-Z]?[a-z]+)*)\s+(injection|tablet|capsule|syrup|drops)\b/g;
    while ((match = drugMentionPattern.exec(response)) !== null) {
      const drugName = match[1].toLowerCase();
      const knownDrugs = ["amoxicillin", "ibuprofen", "prednisone", "omeprazole", "atorvastatin",
        "metformin", "lisinopril", "metoprolol", "levothyroxine", "albuterol",
        "pantoprazole", "rosuvastatin", "amlodipine", "losartan"];
      if (!knownDrugs.some((d) => drugName.includes(d))) {
        events.push({
          category: "fabricated_fact",
          claimText: match[0],
          evidenceAvailable: false,
          confidence: 0.2,
          riskScore: 0.4,
          details: { drugName, type: "unknown_drug" },
        });
      }
    }

    // 4. Specific numerical values (fake lab values)
    const labValuePattern = /(?:blood\s+)?(?:sugar|glucose)\s+(is|:)\s*(\d+)\s*(mg\/dl|mmol)/i;
    match = labValuePattern.exec(response);
    if (match) {
      const value = parseInt(match[2], 10);
      const unit = match[3];
      if (unit && unit.includes("mg") && (value < 10 || value > 600)) {
        events.push({
          category: "fabricated_fact",
          claimText: match[0],
          evidenceAvailable: false,
          confidence: 0.8,
          riskScore: 0.85,
          details: { value, unit, expectedRange: "70-140 mg/dL (fasting)" },
        });
      }
    }

    // 5. Confidence boosting without evidence
    const overconfidencePatterns = [
      /i am (absolutely|100%|completely|certainly) (sure|certain|confident|positive)/i,
      /this is definitely/i,
      /guaranteed?(?!\s*satisfaction)/i,
    ];

    for (const pattern of overconfidencePatterns) {
      if (pattern.test(lower)) {
        events.push({
          category: "impossible_recommendation",
          claimText: response.match(pattern)?.[0] || "overconfidence",
          evidenceAvailable: false,
          confidence: 0.1,
          riskScore: 0.3,
          details: { pattern: pattern.source, context: "medical_advice_overgeneralization" },
        });
      }
    }

    return events;
  }
}
