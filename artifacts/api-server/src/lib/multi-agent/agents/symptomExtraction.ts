import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

const SymptomInputSchema = {};
const SymptomOutputSchema = {};

export class SymptomExtractionAgent extends BaseAgent {
  readonly name = "symptom_extraction";
  readonly description = "Extracts and normalizes symptoms from patient message";
  readonly dependsOn: string[] = [];
  readonly inputSchema = SymptomInputSchema;
  readonly outputSchema = SymptomOutputSchema;

  async execute(input: AgentInput, _context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.maxRetries) {
      try {
        const result = await this.generateJSON<{
          symptoms: Array<{
            name: string; normalized: string; severity: string;
            duration?: string; bodyLocation?: string;
            temporalPattern?: string; progression?: string; negated?: boolean;
          }>;
          primarySymptom?: string; clinicalProfile?: string;
        }>(
          `You are a medical symptom extraction specialist. Extract all symptoms from the patient's message.
          For each symptom:
          - name: The symptom as mentioned
          - normalized: Standard medical terminology
          - severity: mild/moderate/severe based on description
          - duration: How long they've had it
          - bodyLocation: Where on the body
          - temporalPattern: constant/intermittent/worsening/improving
          - progression: getting better/worse/unchanged
          - negated: true if the patient explicitly denies having this symptom
          
          Also identify:
          - primarySymptom: The main complaint
          - clinicalProfile: Brief clinical pattern summary (2-3 words)`,
          input.message,
        );

        if (!result) throw new Error("Failed to extract symptoms");

        return this.buildSuccessOutput(
          {
            symptoms: (result.symptoms ?? []).map((s) => ({
              ...s,
              negated: s.negated ?? false,
            })),
            primarySymptom: result.primarySymptom,
            clinicalProfile: result.clinicalProfile,
            totalSymptoms: (result.symptoms ?? []).length,
          },
          result.symptoms?.length > 0 ? 0.85 : 0.3,
          `Extracted ${result.symptoms?.length ?? 0} symptoms. Primary: ${result.primarySymptom ?? "unknown"}.`,
          startTime,
          retries,
        );
      } catch (err) {
        retries++;
        if (retries > this.maxRetries) {
          return this.buildErrorOutput(
            `Symptom extraction failed after ${retries} attempts: ${err}`,
            startTime, retries,
          );
        }
        await new Promise((r) => setTimeout(r, 300 * retries));
      }
    }

    return this.buildErrorOutput("Unexpected error", startTime, retries);
  }
}

