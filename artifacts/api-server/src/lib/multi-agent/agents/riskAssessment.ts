import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

export class RiskAssessmentAgent extends BaseAgent {
  readonly name = "risk_assessment";
  readonly description = "Determines emergency level, red flags, risk score, and escalation level";
  readonly dependsOn = ["symptom_extraction", "clinical_history", "differential_diagnosis"];
  readonly inputSchema: Record<string, unknown> = {};
  readonly outputSchema: Record<string, unknown> = {};

  async execute(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.maxRetries) {
      try {
        const symptoms = context.agentOutputs.get("symptom_extraction")?.data ?? {};
        const history = context.agentOutputs.get("clinical_history")?.data ?? {};
        const diagnosis = context.agentOutputs.get("differential_diagnosis")?.data ?? {};

        const result = await this.generateJSON<{
          escalationLevel: "routine" | "medical_review" | "urgent_care" | "emergency";
          emergencyLevel: "none" | "low" | "moderate" | "high" | "critical";
          riskScore: number;
          riskCategory: "very_low" | "low" | "moderate" | "high" | "critical";
          redFlags: Array<{ flag: string; category: string; explanation: string }>;
          riskDrivers: string[];
          protectiveFactors: string[];
          recommendedAction: string;
          summary: string;
        }>(
          `You are a medical risk assessment specialist. Analyze the patient's symptoms, history, and potential diagnoses to determine risk.

          Evaluate:
          - escalationLevel: routine (self-care) / medical_review (see doctor in days) / urgent_care (see doctor today) / emergency (immediate)
          - emergencyLevel: none / low / moderate / high / critical
          - riskScore: 0-100 overall risk score
          - riskCategory: very_low / low / moderate / high / critical
          - redFlags: Any red flag symptoms present
          - riskDrivers: What factors are driving the risk score
          - protectiveFactors: What factors reduce risk
          - recommendedAction: Clear next step recommendation

          Be conservative with emergency classifications. Only flag as emergency if there are clear, specific red flags.`,
          `Symptoms: ${JSON.stringify(symptoms)}\n\nHistory: ${JSON.stringify(history)}\n\nDiagnoses: ${JSON.stringify(diagnosis)}\n\nOriginal message: ${input.message}`,
        );

        if (!result) throw new Error("Failed to assess risk");

        return this.buildSuccessOutput(
          {
            escalationLevel: result.escalationLevel ?? "routine",
            emergencyLevel: result.emergencyLevel ?? "none",
            riskScore: result.riskScore ?? 0,
            riskCategory: result.riskCategory ?? "low",
            redFlags: result.redFlags ?? [],
            riskDrivers: result.riskDrivers ?? [],
            protectiveFactors: result.protectiveFactors ?? [],
            recommendedAction: result.recommendedAction ?? "Monitor symptoms at home.",
            summary: result.summary ?? "Risk assessment completed.",
          },
          result.redFlags?.length > 0 ? 0.9 : 0.75,
          result.summary ?? `Risk: ${result.riskCategory ?? "unknown"} (${result.riskScore ?? 0}/100).`,
          startTime,
          retries,
        );
      } catch (err) {
        retries++;
        if (retries > this.maxRetries) {
          return this.buildErrorOutput(`Risk assessment failed: ${err}`, startTime, retries);
        }
        await new Promise((r) => setTimeout(r, 300 * retries));
      }
    }
    return this.buildErrorOutput("Unexpected error", startTime, retries);
  }
}

