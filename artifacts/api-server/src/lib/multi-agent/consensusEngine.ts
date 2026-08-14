import { AgentOutput, ConsensusDecision, Disagreement } from "./types";

interface ConsensusInput {
  agentOutputs: Map<string, AgentOutput>;
  categories: CategoryConsensus[];
}

interface CategoryConsensus {
  name: string;
  sourceAgents: string[];
  extractor: (output: AgentOutput) => { value: any; confidence: number } | null;
  resolver: (values: Array<{ agent: string; value: any; confidence: number }>) => ConsensusDecision;
}

export class ConsensusEngine {
  resolve(input: ConsensusInput): ConsensusDecision[] {
    return input.categories.map((cat) => {
      const values: Array<{ agent: string; value: any; confidence: number }> = [];

      for (const agentName of cat.sourceAgents) {
        const output = input.agentOutputs.get(agentName);
        if (!output || output.status !== "success") continue;
        const extracted = cat.extractor(output);
        if (extracted) {
          values.push({ agent: agentName, value: extracted.value, confidence: extracted.confidence });
        }
      }

      return cat.resolver(values);
    });
  }

  // ─── Resolver: Majority Consensus ───

  static majorityResolver(
    category: string,
    mergeFn: (values: Array<{ agent: string; value: any; confidence: number }>) => {
      text: string; confidence: number;
    },
  ): (values: Array<{ agent: string; value: any; confidence: number }>) => ConsensusDecision {
    return (values) => {
      if (values.length === 0) {
        return {
          category,
          consensusText: `No ${category} data available from agents.`,
          confidence: 0,
          agreementLevel: "conflicting",
          contributingAgents: [],
          dissentingAgents: [],
          disagreements: [],
        };
      }

      const merged = mergeFn(values);
      const sorted = [...values].sort((a, b) => b.confidence - a.confidence);
      const hasConflict = sorted.length > 1 && Math.abs(sorted[0].confidence - sorted[1].confidence) < 0.2;

      let agreementLevel: ConsensusDecision["agreementLevel"];
      if (values.length === 1) {
        agreementLevel = "unanimous";
      } else if (!hasConflict) {
        agreementLevel = "majority";
      } else {
        agreementLevel = "partial";
      }

      const disagreements: Disagreement[] = [];
      if (hasConflict && values.length >= 2) {
        disagreements.push({
          agents: values.map((v) => v.agent),
          issue: `Confidence difference < 20% between top agents`,
          positions: values.map((v) => ({ agent: v.agent, position: JSON.stringify(v.value) })),
          resolution: "unresolved",
        });
      }

      return {
        category,
        consensusText: merged.text,
        confidence: merged.confidence,
        agreementLevel,
        contributingAgents: values.map((v) => v.agent),
        dissentingAgents: hasConflict ? [sorted[sorted.length - 1].agent] : [],
        disagreements,
      };
    };
  }

  // ─── Resolver: Highest Confidence ───

  static highestConfidenceResolver(
    category: string,
  ): (values: Array<{ agent: string; value: any; confidence: number }>) => ConsensusDecision {
    return (values) => {
      if (values.length === 0) {
        return {
          category,
          consensusText: `No ${category} data.`,
          confidence: 0,
          agreementLevel: "conflicting",
          contributingAgents: [],
          dissentingAgents: [],
          disagreements: [],
        };
      }

      const best = values.reduce((a, b) => (a.confidence > b.confidence ? a : b));
      const hasConflict = values.some((v) => v.agent !== best.agent && Math.abs(v.confidence - best.confidence) < 0.15);

      return {
        category,
        consensusText: typeof best.value === "string" ? best.value : JSON.stringify(best.value),
        confidence: best.confidence,
        agreementLevel: values.length === 1 ? "unanimous" : hasConflict ? "partial" : "majority",
        contributingAgents: values.map((v) => v.agent),
        dissentingAgents: hasConflict ? values.filter((v) => v.agent !== best.agent).map((v) => v.agent) : [],
        disagreements: hasConflict ? [{
          agents: values.map((v) => v.agent),
          issue: `Conflicting assessments between agents`,
          positions: values.map((v) => ({ agent: v.agent, position: typeof v.value === "string" ? v.value : JSON.stringify(v.value) })),
          resolution: "unresolved" as const,
        }] : [],
      };
    };
  }

  // ─── Resolver: Aggregate Score ───

  static aggregateResolver(
    category: string,
    extractNumeric: (value: any) => number,
    formatText: (avg: number, values: Array<{ agent: string; value: any; confidence: number }>) => string,
  ): (values: Array<{ agent: string; value: any; confidence: number }>) => ConsensusDecision {
    return (values) => {
      if (values.length === 0) {
        return {
          category,
          consensusText: `No ${category} data.`,
          confidence: 0,
          agreementLevel: "conflicting",
          contributingAgents: [],
          dissentingAgents: [],
          disagreements: [],
        };
      }

      const weightedSum = values.reduce((sum, v) => sum + extractNumeric(v.value) * v.confidence, 0);
      const totalWeight = values.reduce((sum, v) => sum + v.confidence, 0);
      const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const avgConfidence = totalWeight / values.length;

      return {
        category,
        consensusText: formatText(weightedAvg, values),
        confidence: Math.min(avgConfidence, 1),
        agreementLevel: values.length === 1 ? "unanimous" : "majority",
        contributingAgents: values.map((v) => v.agent),
        dissentingAgents: [],
        disagreements: [],
      };
    };
  }
}
