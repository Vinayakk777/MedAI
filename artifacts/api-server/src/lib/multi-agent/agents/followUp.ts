import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

export class FollowUpAgent extends BaseAgent {
  readonly name = "follow_up";
  readonly description = "Decides what information is still missing and which follow-up questions to ask";
  readonly dependsOn = ["symptom_extraction", "clinical_history", "differential_diagnosis", "risk_assessment"];
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
        const risk = context.agentOutputs.get("risk_assessment")?.data ?? {};

        const result = await this.generateJSON<{
          missingInformation: string[];
          followUpQuestions: Array<{ question: string; reason: string; priority: "high" | "medium" | "low" }>;
          canProceed: boolean;
          summary: string;
        }>(
          `You are a clinical follow-up specialist. Determine what information is still needed for a complete assessment.

          Evaluate:
          - missingInformation: What critical information is still unknown
          - followUpQuestions: Specific questions to ask, with reasons
          - canProceed: Whether enough information exists to provide a preliminary assessment
          - summary: Brief assessment of information completeness

          Prioritize questions that would significantly change the differential diagnosis or risk assessment.
          Ask 1-3 questions maximum. Do not ask questions that have already been answered.`,
          `Symptoms: ${JSON.stringify(symptoms)}\n\nHistory: ${JSON.stringify(history)}\n\nDiagnosis: ${JSON.stringify(diagnosis)}\n\nRisk: ${JSON.stringify(risk)}\n\nOriginal message: ${input.message}`,
        );

        if (!result) throw new Error("Failed to determine follow-up needs");

        const canProceed = result.canProceed ?? (result.missingInformation?.length ?? 0) < 3;

        return this.buildSuccessOutput(
          {
            missingInformation: result.missingInformation ?? [],
            followUpQuestions: result.followUpQuestions ?? [],
            canProceed,
            summary: result.summary ?? "Follow-up assessment completed.",
            questionsCount: (result.followUpQuestions ?? []).length,
          },
          canProceed ? 0.85 : 0.6,
          result.summary ?? (canProceed ? "Sufficient information for assessment." : "More information needed."),
          startTime,
          retries,
        );
      } catch (err) {
        retries++;
        if (retries > this.maxRetries) {
          return this.buildErrorOutput(`Follow-up analysis failed: ${err}`, startTime, retries);
        }
        await new Promise((r) => setTimeout(r, 300 * retries));
      }
    }
    return this.buildErrorOutput("Unexpected error", startTime, retries);
  }
}

