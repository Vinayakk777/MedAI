import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

export class SelfCareRecoveryAgent extends BaseAgent {
  readonly name = "self_care_recovery";
  readonly description = "Generates home care, lifestyle advice, monitoring plan, recovery expectations";
  readonly dependsOn = ["differential_diagnosis", "risk_assessment"];
  readonly inputSchema: Record<string, unknown> = {};
  readonly outputSchema: Record<string, unknown> = {};

  async execute(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.maxRetries) {
      try {
        const diagnosis = context.agentOutputs.get("differential_diagnosis")?.data ?? {};
        const risk = context.agentOutputs.get("risk_assessment")?.data ?? {};
        const riskLevel = (risk as any)?.escalationLevel;

        if (riskLevel === "emergency") {
          return this.buildSuccessOutput(
            { recommendations: [], summary: "Self-care not recommended - emergency situation." },
            1.0, "Emergency - self-care not appropriate.", startTime, retries,
          );
        }

        const result = await this.generateJSON<{
          homeCareAdvice: Array<{ category: string; advice: string; reasoning: string }>;
          lifestyleRecommendations: Array<{ category: string; recommendation: string }>;
          monitoringPlan: Array<{ item: string; frequency: string; threshold: string }>;
          recoveryExpectations: { expectedDuration: string; milestones: string[]; whenToSeekHelp: string };
          warningSignals: string[];
          summary: string;
        }>(
          `You are a self-care and recovery specialist. Generate personalized home care advice based on the differential diagnosis.

          Include:
          - homeCareAdvice: Rest, hydration, nutrition, activity modifications (include category and reasoning)
          - lifestyleRecommendations: Sleep, stress management, diet, exercise modifications
          - monitoringPlan: What to monitor, how often, and when to be concerned
          - recoveryExpectations: Expected duration, milestones, when to seek medical help
          - warningSignals: When to seek immediate medical attention

          Tailor every recommendation to the specific symptoms and conditions. Do NOT generate generic fixed lists.
          If escalation level is urgent_care, limit self-care to temporary measures while seeking care.`,
          `Diagnosis: ${JSON.stringify(diagnosis)}\n\nRisk level: ${riskLevel}\n\nOriginal message: ${input.message}`,
        );

        if (!result) throw new Error("Failed to generate self-care plan");

        return this.buildSuccessOutput(
          {
            homeCareAdvice: result.homeCareAdvice ?? [],
            lifestyleRecommendations: result.lifestyleRecommendations ?? [],
            monitoringPlan: result.monitoringPlan ?? [],
            recoveryExpectations: result.recoveryExpectations ?? {},
            warningSignals: result.warningSignals ?? [],
            summary: result.summary ?? "Self-care plan generated.",
          },
          0.8,
          result.summary ?? "Self-care recommendations prepared.",
          startTime,
          retries,
        );
      } catch (err) {
        retries++;
        if (retries > this.maxRetries) {
          return this.buildErrorOutput(`Self-care generation failed: ${err}`, startTime, retries);
        }
        await new Promise((r) => setTimeout(r, 300 * retries));
      }
    }
    return this.buildErrorOutput("Unexpected error", startTime, retries);
  }
}

