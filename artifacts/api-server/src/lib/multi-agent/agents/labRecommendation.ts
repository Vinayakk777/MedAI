import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

export class LabRecommendationAgent extends BaseAgent {
  readonly name = "lab_recommendation";
  readonly description = "Recommends investigations and explains clinical reasoning";
  readonly dependsOn = ["symptom_extraction", "differential_diagnosis", "risk_assessment"];
  readonly inputSchema: Record<string, unknown> = {};
  readonly outputSchema: Record<string, unknown> = {};

  async execute(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();
    let retries = 0;

    while (retries <= this.maxRetries) {
      try {
        const symptoms = context.agentOutputs.get("symptom_extraction")?.data ?? {};
        const diagnosis = context.agentOutputs.get("differential_diagnosis")?.data ?? {};
        const risk = context.agentOutputs.get("risk_assessment")?.data ?? {};

        const result = await this.generateJSON<{
          recommendedTests: Array<{
            testName: string; category: string;
            clinicalReason: string; helpsConfirmOrRuleOut: string[];
            priority: "routine" | "urgent" | "optional"; preparation?: string;
          }>;
          noTestsNeededReason?: string;
          summary: string;
        }>(
          `You are a laboratory medicine specialist. Recommend appropriate diagnostic tests based on symptoms and differential diagnosis.

          For each test:
          - testName: Name of the test
          - category: blood / urine / imaging / microbiology / genetic
          - clinicalReason: Why this test is indicated
          - helpsConfirmOrRuleOut: What conditions this helps differentiate
          - priority: routine / urgent / optional
          - preparation: Any patient preparation needed

          Only recommend tests that are clinically indicated. If no tests are needed, explain why.
          Do NOT recommend unnecessary tests. Consider the risk level when determining priority.`,
          `Symptoms: ${JSON.stringify(symptoms)}\n\nDiagnosis: ${JSON.stringify(diagnosis)}\n\nRisk: ${JSON.stringify(risk)}\n\nOriginal message: ${input.message}`,
        );

        if (!result) throw new Error("Failed to generate lab recommendations");

        const hasTests = (result.recommendedTests?.length ?? 0) > 0;

        return this.buildSuccessOutput(
          {
            recommendedTests: result.recommendedTests ?? [],
            noTestsNeededReason: result.noTestsNeededReason,
            summary: result.summary ?? (hasTests ? `${result.recommendedTests.length} test(s) recommended.` : "No tests needed."),
          },
          hasTests ? 0.8 : 0.9,
          result.summary ?? "Lab recommendations generated.",
          startTime,
          retries,
        );
      } catch (err) {
        retries++;
        if (retries > this.maxRetries) {
          return this.buildErrorOutput(`Lab recommendation failed: ${err}`, startTime, retries);
        }
        await new Promise((r) => setTimeout(r, 300 * retries));
      }
    }
    return this.buildErrorOutput("Unexpected error", startTime, retries);
  }
}

