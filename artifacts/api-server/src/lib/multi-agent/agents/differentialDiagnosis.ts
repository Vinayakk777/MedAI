import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

export class DifferentialDiagnosisAgent extends BaseAgent {
  readonly name = "differential_diagnosis";
  readonly description = "Generates ranked differential diagnoses with supporting and contradicting evidence";
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
          conditions: Array<{
            name: string;
            confidence: number;
            supportingSymptoms: string[];
            contradictingSymptoms: string[];
            riskFactors: string[];
            typicalPresentation: string;
            differentialRationale: string;
          }>;
          confidenceStatement: string;
          summary: string;
        }>(
          `You are a diagnostic reasoning specialist. Generate a ranked differential diagnosis based on the patient's symptoms and history.

          For each condition:
          - name: Medical condition name
          - confidence: 0-100 score based on how well symptoms match
          - supportingSymptoms: Which patient symptoms support this diagnosis
          - contradictingSymptoms: Which patient symptoms make this less likely
          - riskFactors: Patient risk factors for this condition
          - typicalPresentation: How this condition typically presents
          - differentialRationale: Why this condition is being considered over others

          Also provide:
          - confidenceStatement: Overall assessment of diagnostic confidence
          - summary: Brief summary of the differential (2-3 sentences)

          Rank conditions from most to least likely. Be conservative - do not suggest rare or severe conditions without strong evidence. Include common conditions first.`,
          `Patient symptoms: ${JSON.stringify(symptoms)}\n\nPatient history: ${JSON.stringify(history)}\n\nOriginal message: ${input.message}`,
        );

        if (!result || !result.conditions?.length) throw new Error("Failed to generate differential diagnosis");

        return this.buildSuccessOutput(
          {
            conditions: result.conditions,
            confidenceStatement: result.confidenceStatement ?? "Diagnostic confidence is moderate.",
            summary: result.summary ?? "Differential diagnosis generated.",
            totalConditions: result.conditions.length,
          },
          result.conditions[0]?.confidence ? result.conditions[0].confidence / 100 : 0.6,
          result.summary ?? `Generated ${result.conditions.length} differential diagnoses.`,
          startTime,
          retries,
        );
      } catch (err) {
        retries++;
        if (retries > this.maxRetries) {
          return this.buildErrorOutput(`Diagnosis failed: ${err}`, startTime, retries);
        }
        await new Promise((r) => setTimeout(r, 300 * retries));
      }
    }
    return this.buildErrorOutput("Unexpected error", startTime, retries);
  }
}

