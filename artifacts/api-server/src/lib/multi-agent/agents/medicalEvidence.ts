import { BaseAgent } from "../baseAgent";
import { AgentInput, AgentOutput, AgentContext } from "../types";

export class MedicalEvidenceAgent extends BaseAgent {
  readonly name = "medical_evidence";
  readonly description = "Retrieves supporting evidence from the RAG engine and attaches citations";
  readonly dependsOn = ["symptom_extraction", "differential_diagnosis"];
  readonly inputSchema: Record<string, unknown> = {};
  readonly outputSchema: Record<string, unknown> = {};

  async execute(input: AgentInput, context: AgentContext): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      const symptoms = context.agentOutputs.get("symptom_extraction")?.data ?? {};
      const diagnosis = context.agentOutputs.get("differential_diagnosis")?.data ?? {};

      // Build query from symptoms and diagnoses
      const conditions = ((diagnosis as any)?.conditions ?? []).map((c: any) => c.name).join(" ");
      const symptomText = ((symptoms as any)?.symptoms ?? []).map((s: any) => s.normalized).join(" ");
      const queryText = [symptomText, conditions, (symptoms as any)?.clinicalProfile ?? ""]
        .filter(Boolean).join(" ").trim();

      if (!queryText || queryText.length < 5) {
        return this.buildSuccessOutput(
          { evidence: [], citations: [], noEvidenceMessage: "Insufficient query to retrieve evidence." },
          0.5, "Not enough clinical data for evidence retrieval.", startTime, 0,
        );
      }

      // Dynamically import RAG engine
      try {
        const { getRagEngine } = await import("../../rag/ragEngine");
        const engine = getRagEngine();
        const { evidenceBlock, citations } = await engine.formatEvidenceForPrompt({
          text: queryText,
          pipelineStage: "diagnosis",
          useCache: true,
        });

        return this.buildSuccessOutput(
          {
            evidenceBlock,
            citations: citations.map((c: any) => ({
              organization: c.organization,
              guidelineName: c.guidelineName,
              confidence: c.confidence,
              relevanceScore: c.relevanceScore,
              evidenceText: c.evidenceText?.slice(0, 300),
            })),
            hasEvidence: citations.length > 0,
            queryUsed: queryText,
          },
          citations.length > 0 ? 0.85 : 0.3,
          citations.length > 0
            ? `Retrieved ${citations.length} evidence passage(s) from medical knowledge base.`
            : "No high-confidence medical evidence found.",
          startTime,
          0,
        );
      } catch {
        return this.buildSuccessOutput(
          { evidenceBlock: "", citations: [], hasEvidence: false },
          0.5, "Evidence retrieval unavailable.",
          startTime, 0,
        );
      }
    } catch (err) {
      return this.buildErrorOutput(`Evidence retrieval failed: ${err}`, startTime, 0);
    }
  }
}

