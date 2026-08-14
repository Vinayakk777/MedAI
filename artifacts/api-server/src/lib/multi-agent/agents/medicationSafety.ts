import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

export class MedicationSafetyAgent extends BaseAgent {
  readonly name = "medication_safety";
  readonly description = "Evaluates drug interactions, allergies, contraindications, pregnancy safety, organ impairment";
  readonly dependsOn = ["symptom_extraction", "clinical_history"];
  readonly inputSchema: Record<string, unknown> = {};
  readonly outputSchema: Record<string, unknown> = {};

  async execute(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.maxRetries) {
      try {
        const symptoms = context.agentOutputs.get("symptom_extraction")?.data ?? {};
        const history = context.agentOutputs.get("clinical_history")?.data ?? {};

        const result = await this.generateJSON<{
          potentialInteractions: Array<{ medications: string[]; severity: string; description: string }>;
          allergyConcerns: Array<{ allergen: string; severity: string; recommendation: string }>;
          contraindications: Array<{ condition: string; contraindicated: string; reasoning: string }>;
          pregnancyConsiderations: string[];
          organImpairmentConcerns: string[];
          safetySummary: string;
          overallSafetyScore: number;
        }>(
          `You are a medication safety specialist. Evaluate medication safety based on patient history and symptoms.

          Assess:
          - potentialInteractions: Any drug-drug interactions (medications involved, severity: mild/moderate/severe)
          - allergyConcerns: Any medication allergies or concerns
          - contraindications: Conditions that contraindicate certain medications
          - pregnancyConsiderations: If patient is pregnant or may be, relevant considerations
          - organImpairmentConcerns: Liver/kidney impairment considerations
          - safetySummary: Overall medication safety assessment
          - overallSafetyScore: 0-100 safety score

          If no medications or conditions are mentioned, state that clearly. Do not invent medications.`,
          `Patient history: ${JSON.stringify(history)}\n\nSymptoms: ${JSON.stringify(symptoms)}\n\nOriginal message: ${input.message}`,
        );

        if (!result) throw new Error("Failed to evaluate medication safety");

        return this.buildSuccessOutput(
          {
            interactions: result.potentialInteractions ?? [],
            allergyConcerns: result.allergyConcerns ?? [],
            contraindications: result.contraindications ?? [],
            pregnancyConsiderations: result.pregnancyConsiderations ?? [],
            organImpairmentConcerns: result.organImpairmentConcerns ?? [],
            safetySummary: result.safetySummary ?? "No medication safety concerns identified.",
            overallSafetyScore: result.overallSafetyScore ?? 100,
          },
          result.overallSafetyScore ? result.overallSafetyScore / 100 : 0.8,
          result.safetySummary ?? "Medication safety evaluated.",
          startTime,
          retries,
        );
      } catch (err) {
        retries++;
        if (retries > this.maxRetries) {
          return this.buildErrorOutput(`Medication safety evaluation failed: ${err}`, startTime, retries);
        }
        await new Promise((r) => setTimeout(r, 300 * retries));
      }
    }
    return this.buildErrorOutput("Unexpected error", startTime, retries);
  }
}

