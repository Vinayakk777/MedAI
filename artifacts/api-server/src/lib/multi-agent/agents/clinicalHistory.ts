import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

const HistoryInputSchema = {};

export class ClinicalHistoryAgent extends BaseAgent {
  readonly name = "clinical_history";
  readonly description = "Analyzes past medical history, chronic diseases, allergies, medications, lifestyle";
  readonly dependsOn = ["symptom_extraction"];
  readonly inputSchema = HistoryInputSchema;
  readonly outputSchema: Record<string, unknown> = {};

  async execute(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.maxRetries) {
      try {
        const symptomsOutput = context.agentOutputs.get("symptom_extraction");
        const symptoms = symptomsOutput?.data?.symptoms ?? [];

        const patientInfo = input.patientData;
        const patientContext = patientInfo ? `
Known Patient Data:
- Age: ${patientInfo.age ?? "unknown"}
- Sex: ${patientInfo.sex ?? "unknown"}
- Pregnancy: ${patientInfo.pregnancy ?? "unknown"}
- Chronic conditions: ${(patientInfo.chronicConditions ?? []).join(", ") || "none reported"}
- Allergies: ${(patientInfo.allergies ?? []).join(", ") || "none reported"}
- Current medications: ${(patientInfo.medications ?? []).join(", ") || "none reported"}` : "No known patient data.";

        const result = await this.generateJSON<{
          relevantHistory: string[];
          chronicConditions: string[];
          allergies: Array<{ allergen: string; reaction?: string; severity?: string }>;
          medications: Array<{ name: string; purpose?: string; concern?: string }>;
          lifestyleFactors: string[];
          surgicalHistory: string[];
          familyHistory: string[];
          summary: string;
        }>(
          `You are a clinical history analysis specialist. Extract relevant medical history from the patient message and combine with known patient data.

          Extract:
          - relevantHistory: Past medical history items mentioned
          - chronicConditions: Known or mentioned chronic diseases
          - allergies: Any allergies mentioned or known
          - medications: Current medications mentioned or known
          - lifestyleFactors: Diet, exercise, smoking, alcohol, sleep
          - surgicalHistory: Past surgeries
          - familyHistory: Family medical history
          - summary: Brief clinical history summary (1-2 sentences)

          Only include information that is explicitly mentioned or confidently known. Do not invent history.`,
          `Patient Message: ${input.message}\n\n${patientContext}\n\nExtracted Symptoms: ${JSON.stringify(symptoms)}`,
        );

        if (!result) throw new Error("Failed to analyze clinical history");

        return this.buildSuccessOutput(
          {
            history: result.relevantHistory ?? [],
            chronicConditions: result.chronicConditions ?? [],
            allergies: result.allergies ?? [],
            medications: result.medications ?? [],
            lifestyleFactors: result.lifestyleFactors ?? [],
            surgicalHistory: result.surgicalHistory ?? [],
            familyHistory: result.familyHistory ?? [],
            summary: result.summary ?? "No significant medical history identified.",
          },
          0.8,
          result.summary ?? "History analyzed.",
          startTime,
          retries,
        );
      } catch (err) {
        retries++;
        if (retries > this.maxRetries) {
          return this.buildErrorOutput(`History analysis failed: ${err}`, startTime, retries);
        }
        await new Promise((r) => setTimeout(r, 300 * retries));
      }
    }
    return this.buildErrorOutput("Unexpected error", startTime, retries);
  }
}

