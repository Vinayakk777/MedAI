import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Cpu, GitBranch, BarChart3,
  Play, RotateCcw, Zap,
} from "lucide-react";

type AgentResult = {
  agentName: string;
  status: string;
  data: Record<string, unknown>;
  confidence: number;
  summary: string;
  processingTimeMs: number;
  error?: string;
  retryCount: number;
};

type ConsensusDecision = {
  category: string;
  consensusText: string;
  confidence: number;
  agreementLevel: string;
  contributingAgents: string[];
  dissentingAgents: string[];
};

type PipelineRun = {
  runId: string;
  pipelineName: string;
  status: string;
  totalDurationMs: number;
  agentResults: Record<string, AgentResult>;
  consensusDecisions: ConsensusDecision[];
  responseContent?: string;
  errors: Array<{ agentName: string; error: string; retryCount: number; fatal: boolean }>;
};

interface AgentNodeProps {
  name: string;
  result?: AgentResult;
  order: number;
  dependsOn: string[];
}

function AgentNode({ name, result, order, dependsOn }: AgentNodeProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = result?.status === "success" ? CheckCircle :
    result?.status === "error" ? XCircle : Clock;
  const statusColor = result?.status === "success" ? "text-emerald-400" :
    result?.status === "error" ? "text-rose-400" : "text-muted-foreground/40";
  const Icon = statusIcon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: order * 0.05 }}
      className="rounded-lg border border-white/5 bg-white/[0.03] overflow-hidden"
    >
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-2.5 hover:bg-white/5 transition-colors text-left">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex items-center justify-center w-5 h-5 rounded-full ${statusColor}/10`}>
            <Icon className={`w-3 h-3 ${statusColor}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-foreground">{name}</span>
              <span className={`text-[9px] px-1 py-0.5 rounded ${
                result?.status === "success" ? "bg-emerald-500/10 text-emerald-400" :
                result?.status === "error" ? "bg-rose-500/10 text-rose-400" :
                "bg-white/5 text-muted-foreground/50"
              }`}>
                {result?.status ?? "pending"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] text-muted-foreground/40">#{order}</span>
              {result && (
                <>
                  <span className="text-[9px] text-muted-foreground/30">·</span>
                  <span className="text-[9px] text-muted-foreground/40">{result.processingTimeMs}ms</span>
                  <span className="text-[9px] text-muted-foreground/30">·</span>
                  <span className="text-[9px] text-muted-foreground/40">{(result.confidence * 100).toFixed(0)}%</span>
                  {result.retryCount > 0 && (
                    <>
                      <span className="text-[9px] text-muted-foreground/30">·</span>
                      <span className="text-[9px] text-amber-400/60">{result.retryCount} retr{(result.retryCount > 1 ? "ies" : "y")}</span>
                    </>
                  )}
                </>
              )}
              {dependsOn.length > 0 && (
                <>
                  <span className="text-[9px] text-muted-foreground/30">·</span>
                  <span className="text-[9px] text-muted-foreground/40">dep: {dependsOn.join(", ")}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <ChevronDown className={`w-3 h-3 text-muted-foreground/40 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {expanded && result && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="px-2.5 pb-2.5 space-y-1.5">
              <p className="text-[10px] text-muted-foreground/70">{result.summary}</p>
              {result.error && (
                <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20">
                  <p className="text-[10px] text-rose-300">{result.error}</p>
                </div>
              )}
              <details>
                <summary className="text-[9px] text-muted-foreground/40 cursor-pointer hover:text-foreground transition-colors">
                  Output data ({Object.keys(result.data).length} fields)
                </summary>
                <pre className="mt-1 p-2 rounded bg-background/50 text-[9px] text-muted-foreground/60 overflow-x-auto max-h-32">
                  {JSON.stringify(result.data, null, 2).slice(0, 1000)}
                </pre>
              </details>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ConsensusCard({ decision }: { decision: ConsensusDecision }) {
  const agreementColor = decision.agreementLevel === "unanimous" ? "text-emerald-400" :
    decision.agreementLevel === "majority" ? "text-cyan-400" :
    decision.agreementLevel === "partial" ? "text-amber-400" : "text-rose-400";

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="w-3 h-3 text-violet-400" />
        <span className="text-[10px] font-medium text-foreground capitalize">{decision.category}</span>
        <span className={`text-[9px] ${agreementColor}`}>{decision.agreementLevel}</span>
        <span className="text-[9px] text-muted-foreground/40">{(decision.confidence * 100).toFixed(0)}%</span>
      </div>
      <p className="text-[10px] text-muted-foreground/70">{decision.consensusText}</p>
      <div className="flex items-center gap-1.5 mt-1">
        {decision.contributingAgents.map((a) => (
          <span key={a} className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground/50">{a}</span>
        ))}
        {decision.dissentingAgents.length > 0 && (
          <span className="text-[8px] text-rose-400/60">dissenting: {decision.dissentingAgents.join(", ")}</span>
        )}
      </div>
    </div>
  );
}

export function AgentPipelineDebug({ run }: { run?: PipelineRun | null }) {
  const [autoRefresh, setAutoRefresh] = useState(false);

  if (!run) {
    return (
      <div className="rounded-xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-foreground">Agent Pipeline</h3>
        </div>
        <p className="text-xs text-muted-foreground/60">No pipeline execution data. Run the multi-agent pipeline to see results.</p>
      </div>
    );
  }

  const agentEntries = Object.entries(run.agentResults);
  const pipelineStages = [
    { name: "symptom_extraction", dependsOn: [] },
    { name: "clinical_history", dependsOn: ["symptom_extraction"] },
    { name: "differential_diagnosis", dependsOn: ["symptom_extraction", "clinical_history"] },
    { name: "risk_assessment", dependsOn: ["symptom_extraction", "clinical_history", "differential_diagnosis"] },
    { name: "medication_safety", dependsOn: ["symptom_extraction", "clinical_history"] },
    { name: "lab_recommendation", dependsOn: ["symptom_extraction", "differential_diagnosis", "risk_assessment"] },
    { name: "self_care_recovery", dependsOn: ["differential_diagnosis", "risk_assessment"] },
    { name: "medical_evidence", dependsOn: ["symptom_extraction", "differential_diagnosis"] },
    { name: "follow_up", dependsOn: ["symptom_extraction", "clinical_history", "differential_diagnosis", "risk_assessment"] },
    { name: "report_generation", dependsOn: [
      "symptom_extraction", "clinical_history", "differential_diagnosis",
      "risk_assessment", "medication_safety", "lab_recommendation",
      "self_care_recovery", "medical_evidence",
    ] },
  ];

  return (
    <div className="rounded-xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-violet-400" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Agent Pipeline</h3>
            <p className="text-[10px] text-muted-foreground/40">Run: {run.runId.slice(0, 8)}... | {run.pipelineName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            run.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
            run.status === "partial" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
            "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}>
            {run.status}
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-center">
          <p className="text-xs font-bold text-foreground">{agentEntries.length}</p>
          <p className="text-[9px] text-muted-foreground/50">Agents</p>
        </div>
        <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-center">
          <p className="text-xs font-bold text-emerald-400">{agentEntries.filter(([, r]) => r.status === "success").length}</p>
          <p className="text-[9px] text-muted-foreground/50">Succeeded</p>
        </div>
        <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-center">
          <p className="text-xs font-bold text-rose-400">{agentEntries.filter(([, r]) => r.status === "error").length}</p>
          <p className="text-[9px] text-muted-foreground/50">Failed</p>
        </div>
        <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-center">
          <p className="text-xs font-bold text-foreground">{run.totalDurationMs}ms</p>
          <p className="text-[9px] text-muted-foreground/50">Total</p>
        </div>
      </div>

      {/* Agent execution flow */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-medium text-foreground">Execution Flow</span>
          <span className="text-[9px] text-muted-foreground/40">({agentEntries.length} agents)</span>
        </div>
        <div className="space-y-1">
          {pipelineStages.map((stage, i) => (
            <AgentNode
              key={stage.name}
              name={stage.name}
              result={run.agentResults[stage.name]}
              order={i + 1}
              dependsOn={stage.dependsOn}
            />
          ))}
        </div>
      </div>

      {/* Consensus decisions */}
      {run.consensusDecisions.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="w-3 h-3 text-violet-400" />
            <span className="text-[10px] font-medium text-foreground">Consensus Decisions</span>
            <span className="text-[9px] text-muted-foreground/40">({run.consensusDecisions.length})</span>
          </div>
          <div className="space-y-1">
            {run.consensusDecisions.map((d) => (
              <ConsensusCard key={d.category} decision={d} />
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {run.errors.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span className="text-[10px] font-medium text-foreground">Errors</span>
          </div>
          <div className="space-y-1">
            {run.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <XCircle className="w-3 h-3 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-medium text-rose-300">{e.agentName}</p>
                  <p className="text-[9px] text-muted-foreground">{e.error}</p>
                  <p className="text-[8px] text-muted-foreground/40">Retries: {e.retryCount} | Fatal: {String(e.fatal)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response preview */}
      {run.responseContent && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-medium text-foreground">Generated Response</span>
          </div>
          <div className="p-3 rounded-lg bg-background/50 border border-white/5 text-[10px] text-muted-foreground/70 leading-relaxed max-h-48 overflow-y-auto">
            {run.responseContent.slice(0, 1500)}
            {run.responseContent.length > 1500 && "..."}
          </div>
        </div>
      )}
    </div>
  );
}
