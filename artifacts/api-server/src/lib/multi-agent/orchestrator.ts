import {
  AgentDefinition, AgentInput, AgentOutput, AgentContext,
  PipelineDefinition, PipelineResult, PipelineError,
  ConsensusDecision, PatientProfile,
} from "./types";
import { getAgent } from "./registry";
import { ConsensusEngine } from "./consensusEngine";
import { ResponseGenerator } from "./responseGenerator";
import { ExecutionLogger } from "./executionLogger";

export class Orchestrator {
  private consensusEngine: ConsensusEngine;
  private responseGenerator: ResponseGenerator;
  private logger: ExecutionLogger;

  constructor() {
    this.consensusEngine = new ConsensusEngine();
    this.responseGenerator = new ResponseGenerator();
    this.logger = new ExecutionLogger();
  }

  async runPipeline(params: {
    pipeline: PipelineDefinition;
    message: string;
    history: { role: string; content: string }[];
    userId: string;
    conversationId?: string;
    patientData?: PatientProfile;
    signal?: AbortSignal;
  }): Promise<PipelineResult> {
    const startTime = Date.now();
    const runId = await this.logger.createRun({
      userId: params.userId,
      conversationId: params.conversationId,
      pipelineName: params.pipeline.name,
    });

    const agentContext: AgentContext = {
      runId,
      userId: params.userId,
      conversationId: params.conversationId,
      message: params.message,
      history: params.history,
      patientData: params.patientData,
      agentOutputs: new Map(),
      metadata: {},
      signal: params.signal,
    };

    const agentInput: AgentInput = {
      message: params.message,
      history: params.history,
      patientData: params.patientData,
      previousAgentOutputs: agentContext.agentOutputs,
    };

    const results = new Map<string, AgentOutput>();
    const errors: PipelineError[] = [];
    const executionOrder: string[] = [];

    // Resolve stage dependencies and execute
    const stages = params.pipeline.stages;
    const completed = new Set<string>();

    while (completed.size < stages.length) {
      const batch = this.getReadyStages(stages, completed);

      if (batch.length === 0 && completed.size < stages.length) {
        // Deadlock - some stages have unmet dependencies
        for (const stage of stages) {
          if (!completed.has(stage.agentName)) {
            errors.push({
              agentName: stage.agentName,
              error: `Unmet dependency: ${stage.dependsOn.filter((d) => !completed.has(d)).join(", ")}`,
              retryCount: 0,
              fatal: true,
            });
            completed.add(stage.agentName);
          }
        }
        break;
      }

      // Execute batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (stage) => {
          const agent = getAgent(stage.agentName);
          if (!agent) {
            return this.handleMissingAgent(stage.agentName);
          }

          // Check dependencies all completed
          const depOk = stage.dependsOn.every((d) => completed.has(d));
          if (!depOk) return null;

          executionOrder.push(stage.agentName);
          const output = await this.executeAgent(agent, agentInput, agentContext, stage);
          return { name: stage.agentName, output };
        }),
      );

      for (const result of batchResults) {
        if (!result) continue;
        results.set(result.name, result.output);
        agentContext.agentOutputs.set(result.name, result.output);
        completed.add(result.name);

        if (result.output.status === "error") {
          errors.push({
            agentName: result.name,
            error: result.output.error ?? "Unknown error",
            retryCount: result.output.retryCount,
            fatal: !this.isOptional(result.name, params.pipeline),
          });
        }

        // Persist execution
        await this.logger.logExecution({
          pipelineRunId: runId,
          userId: params.userId,
          agentName: result.name,
          status: result.output.status,
          inputData: agentInput as any,
          outputData: result.output.data,
          confidence: result.output.confidence,
          durationMs: result.output.processingTimeMs,
          retryCount: result.output.retryCount,
          error: result.output.error,
        });

        // Update performance metrics
        await this.logger.updateAgentPerformance(
          result.name,
          result.output.processingTimeMs,
          result.output.confidence,
          result.output.status === "success",
        );
      }
    }

    // ─── Consensus Phase ───
    const consensusDecisions = this.buildConsensus(results);

    // Persist consensus decisions
    for (const decision of consensusDecisions) {
      await this.logger.logConsensus({ ...decision, pipelineRunId: runId });
    }

    // ─── Response Generation ───
    const responseContent = this.responseGenerator.generate(
      results,
      consensusDecisions,
      params.message,
    );

    // Finalize run
    const totalDurationMs = Date.now() - startTime;
    const successful = Array.from(results.values()).filter((r) => r.status === "success").length;
    const failed = Array.from(results.values()).filter((r) => r.status === "error").length;
    const overallStatus = failed === 0 ? "completed" : successful > 0 ? "partial" : "failed";

    await this.logger.completeRun(runId, {
      status: overallStatus,
      executionOrder,
      consensusSummary: consensusDecisions.map((d) => `${d.category}: ${d.agreementLevel}`).join("; "),
      responseContent,
      totalDurationMs,
      totalAgents: results.size,
      successfulAgents: successful,
      failedAgents: failed,
    });

    return {
      runId,
      pipelineName: params.pipeline.name,
      status: overallStatus,
      totalDurationMs,
      agentResults: results,
      consensusDecisions,
      responseContent,
      errors,
    };
  }

  private getReadyStages(stages: import("./types").PipelineStage[], completed: Set<string>): import("./types").PipelineStage[] {
    return stages.filter(
      (s) => !completed.has(s.agentName) && s.dependsOn.every((d) => completed.has(d)),
    );
  }

  private async executeAgent(
    agent: AgentDefinition,
    input: AgentInput,
    context: AgentContext,
    stage: import("./types").PipelineStage,
  ): Promise<AgentOutput> {
    const timeoutMs = stage.timeoutMs ?? agent.timeoutMs ?? 14000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const mergedInput: AgentInput = {
        ...input,
        previousAgentOutputs: context.agentOutputs,
      };
      return await agent.execute(mergedInput, context);
    } catch (err) {
      return {
        agentName: agent.name,
        status: "error",
        data: {},
        confidence: 0,
        summary: `Execution failed: ${err}`,
        processingTimeMs: 0,
        error: String(err),
        retryCount: 0,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private handleMissingAgent(name: string): { name: string; output: AgentOutput } {
    return {
      name,
      output: {
        agentName: name,
        status: "error",
        data: {},
        confidence: 0,
        summary: `Agent "${name}" not found in registry`,
        processingTimeMs: 0,
        error: `Agent not registered`,
        retryCount: 0,
      },
    };
  }

  private isOptional(agentName: string, pipeline: PipelineDefinition): boolean {
    return pipeline.stages.find((s) => s.agentName === agentName)?.optional ?? false;
  }

  private buildConsensus(results: Map<string, AgentOutput>): ConsensusDecision[] {
    const decisions: ConsensusDecision[] = [];

    // Symptoms consensus
    decisions.push(...this.consensusEngine.resolve({
      agentOutputs: results,
      categories: [
        {
          name: "diagnosis",
          sourceAgents: ["differential_diagnosis"],
          extractor: (o) => {
            const conditions = (o.data as any)?.conditions;
            if (conditions?.length > 0) {
              return {
                value: conditions.map((c: any) => c.name).join(", "),
                confidence: (conditions[0]?.confidence ?? 50) / 100,
              };
            }
            return null;
          },
          resolver: ConsensusEngine.highestConfidenceResolver("diagnosis"),
        },
        {
          name: "risk_level",
          sourceAgents: ["risk_assessment"],
          extractor: (o) => ({
            value: (o.data as any)?.escalationLevel ?? "routine",
            confidence: o.confidence,
          }),
          resolver: ConsensusEngine.highestConfidenceResolver("risk_level"),
        },
        {
          name: "self_care",
          sourceAgents: ["self_care_recovery"],
          extractor: (o) => ({
            value: (o.data as any)?.summary ?? "",
            confidence: o.confidence,
          }),
          resolver: ConsensusEngine.highestConfidenceResolver("self_care"),
        },
        {
          name: "medication_safety",
          sourceAgents: ["medication_safety"],
          extractor: (o) => {
            const score = (o.data as any)?.overallSafetyScore;
            return score !== undefined ? { value: score, confidence: o.confidence } : null;
          },
          resolver: ConsensusEngine.aggregateResolver(
            "medication_safety",
            (v) => v,
            (avg) => `Medication safety score: ${Math.round(avg)}/100`,
          ),
        },
        {
          name: "follow_up",
          sourceAgents: ["follow_up"],
          extractor: (o) => ({
            value: (o.data as any)?.canProceed ?? true,
            confidence: o.confidence,
          }),
          resolver: ConsensusEngine.highestConfidenceResolver("follow_up"),
        },
        {
          name: "evidence",
          sourceAgents: ["medical_evidence"],
          extractor: (o) => ({
            value: (o.data as any)?.hasEvidence ? "evidence_found" : "no_evidence",
            confidence: o.confidence,
          }),
          resolver: ConsensusEngine.highestConfidenceResolver("evidence"),
        },
      ],
    }));

    return decisions;
  }
}
