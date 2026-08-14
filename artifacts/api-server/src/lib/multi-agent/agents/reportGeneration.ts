import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

export class ReportGenerationAgent extends BaseAgent {
  readonly name = "report_generation";
  readonly description = "Produces structured consultation reports from all agent outputs";
  readonly dependsOn = [
    "symptom_extraction", "clinical_history", "differential_diagnosis",
    "risk_assessment", "medication_safety", "lab_recommendation",
    "self_care_recovery", "medical_evidence", "consensus_engine",
  ];
  readonly inputSchema: Record<string, unknown> = {};
  readonly outputSchema: Record<string, unknown> = {};

  async execute(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      const allOutputs: Record<string, any> = {};
      for (const [name, output] of context.agentOutputs) {
        allOutputs[name] = output.data;
      }

      const result = await this.generateJSON<{
        consultationSummary: string;
        keyFindings: string[];
        diagnoses: Array<{ name: string; confidence: string }>;
        riskLevel: string;
        recommendations: string[];
        medicationsConcerns: string[];
        suggestedTests: string[];
        selfCareAdvice: string[];
        evidenceSummary: string;
        followUpPlan: string;
        disclaimer: string;
      }>(
        `You are a medical report generation specialist. Produce a structured consultation report from all agent outputs.

        Generate:
        - consultationSummary: 2-3 sentence summary of the entire consultation
        - keyFindings: List of key clinical findings
        - diagnoses: Final diagnosis list with confidence levels
        - riskLevel: Overall risk assessment
        - recommendations: Treatment and next-step recommendations
        - medicationsConcerns: Any medication-related concerns
        - suggestedTests: Recommended investigations
        - selfCareAdvice: Self-care guidance summary
        - evidenceSummary: What medical evidence supports the assessment
        - followUpPlan: Follow-up recommendations
        - disclaimer: Standard medical disclaimer

        Write in clear, patient-friendly language. Avoid medical jargon.`,
        `Agent Outputs: ${JSON.stringify(allOutputs, null, 2)}\n\nOriginal message: ${input.message}`,
      );

      if (!result) throw new Error("Failed to generate report");

      return this.buildSuccessOutput(
        {
          consultationSummary: result.consultationSummary ?? "",
          keyFindings: result.keyFindings ?? [],
          diagnoses: result.diagnoses ?? [],
          riskLevel: result.riskLevel ?? "Not assessed",
          recommendations: result.recommendations ?? [],
          medicationsConcerns: result.medicationsConcerns ?? [],
          suggestedTests: result.suggestedTests ?? [],
          selfCareAdvice: result.selfCareAdvice ?? [],
          evidenceSummary: result.evidenceSummary ?? "",
          followUpPlan: result.followUpPlan ?? "",
          disclaimer: result.disclaimer ?? "This report is AI-generated and for educational purposes only.",
        },
        0.8,
        result.consultationSummary ?? "Report generated.",
        startTime,
        0,
      );
    } catch (err) {
      return this.buildErrorOutput(`Report generation failed: ${err}`, startTime, 0);
    }
  }
}

