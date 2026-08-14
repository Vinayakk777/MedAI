import { SafetyValidator, ValidationResult, SafetyContext } from "../types";

interface InjectionPattern {
  pattern: RegExp;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
}

export class PromptInjectionDefender implements SafetyValidator {
  readonly name = "prompt_injection";
  readonly description = "Detects prompt injection, jailbreak, and system override attempts";

  private readonly patterns: InjectionPattern[] = [
    { pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|directions)/i, category: "ignore_instructions", severity: "critical", description: "Ignore prior instructions attack" },
    { pattern: /forget|disregard|override\s+(your\s+)?(instructions|training|rules|guidelines)/i, category: "system_override", severity: "critical", description: "System instruction override attempt" },
    { pattern: /pretend\s+(to\s+be|you\s+are|you\'?re)/i, category: "role_play", severity: "high", description: "Role-playing persona shift attempt" },
    { pattern: /you\s+are\s+(now|no\s+longer)\s+(a\s+)?(doctor|medical|healthcare|ai|assistant)\s+(now|anymore)?/i, category: "system_override", severity: "critical", description: "Identity override attempt" },
    { pattern: /((act|respond)\s+)?as\s+if\s+you\s+(are|were)\s+(\w+\s*){1,5}(ai|assistant|doctor)/i, category: "role_play", severity: "high", description: "Act-as role-play attempt" },
    { pattern: /[Rr]eveal\s+(your\s+)?(system\s+)?(prompt|instructions|guidelines|rules|config|configuration)/i, category: "prompt_extraction", severity: "critical", description: "Prompt extraction attempt" },
    { pattern: /show\s+(me\s+)?(the\s+)?(system\s+)?(prompt|instructions)/i, category: "prompt_extraction", severity: "critical", description: "Prompt extraction attempt" },
    { pattern: /what\s+are\s+(your\s+)?(instructions|guidelines|rules|prompts|directives)/i, category: "prompt_extraction", severity: "high", description: "Internal instruction extraction attempt" },
    { pattern: /print\s+(your\s+)?(system\s+)?(prompt|instructions|rules)/i, category: "prompt_extraction", severity: "critical", description: "System prompt dump attempt" },
    { pattern: /DAN|do\s+anything\s+now|jailbroken|jail\s*break/i, category: "jailbreak", severity: "critical", description: "Jailbreak keyword detected" },
    { pattern: /you\s+(don\'?t|do\s+not)\s+have\s+to\s+follow/i, category: "ignore_instructions", severity: "critical", description: "Rule circumvention attempt" },
    { pattern: /output\s+(your\s+)?(internal|system|hidden|secret)\s+(\w+\s*){1,4}/i, category: "prompt_extraction", severity: "critical", description: "Internal state extraction attempt" },
    { pattern: /respond\s+in\s+(a\s+)?language\s+(other\s+than\s+|different\s+from\s+)/i, category: "system_override", severity: "low", description: "Language override attempt" },
    { pattern: /use\s+(leetspeak|base64|rot13|caesar|cipher|encoding)/i, category: "jailbreak", severity: "high", description: "Encoded command attempt" },
    { pattern: /the\s+(aforesaid|aforementioned|above)\s+(statements?|text|message)\s+(are|were)\s+false/i, category: "jailbreak", severity: "critical", description: "Gaslighting/confusion attack" },
  ];

  async validate(response: string, context: SafetyContext): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    const query = context.queryText;

    // Scan query for injection patterns
    for (const entry of this.patterns) {
      const match = query.match(entry.pattern);
      if (match) {
        results.push({
          validatorName: this.name,
          status: "failed",
          severity: entry.severity,
          message: `Prompt injection detected: ${entry.description}`,
          details: {
            category: entry.category,
            matchedPattern: match[0],
            patternSource: entry.pattern.source,
          },
          triggerText: match[0].substring(0, 200),
          suggestedAction: "block",
        });
      }
    }

    // No injection detected
    if (results.length === 0) {
      results.push({
        validatorName: this.name,
        status: "passed",
        severity: "info",
        message: "No prompt injection patterns detected.",
        details: {},
        suggestedAction: "allow",
      });
    }

    return results;
  }
}
