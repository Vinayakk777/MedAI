import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, Activity, Brain, FileText } from "lucide-react";

type SafetySummary = {
  totalEvaluations: number;
  violationsLast24h: number;
  hallucinationsLast7d: number;
  averageQualityScore: number;
  averageConfidenceScore: number;
  totalBlocked: number;
};

type TimelineEntry = {
  id: string;
  overallStatus: string;
  action: string;
  qualityScore: number | null;
  hallucinationScore: number | null;
  confidenceScore: number | null;
  createdAt: string;
};

export function SafetyDashboard() {
  const { data: summary, isLoading } = useQuery<SafetySummary>({
    queryKey: ["safety-summary"],
    queryFn: () => fetch("/api/safety/summary").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: timeline } = useQuery<TimelineEntry[]>({
    queryKey: ["safety-timeline"],
    queryFn: () => fetch("/api/safety/evaluations?limit=20").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading safety dashboard...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Safety & Guardrails Dashboard</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
          label="Total Evaluations"
          value={summary?.totalEvaluations ?? 0}
        />
        <SummaryCard
          icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
          label="Violations (24h)"
          value={summary?.violationsLast24h ?? 0}
          warn={!!summary?.violationsLast24h}
        />
        <SummaryCard
          icon={<Brain className="w-5 h-5 text-amber-400" />}
          label="Hallucinations (7d)"
          value={summary?.hallucinationsLast7d ?? 0}
          warn={!!summary?.hallucinationsLast7d}
        />
        <SummaryCard
          icon={<Activity className="w-5 h-5 text-blue-400" />}
          label="Quality Score"
          value={summary?.averageQualityScore != null ? `${summary.averageQualityScore.toFixed(0)}%` : "N/A"}
        />
        <SummaryCard
          icon={<Shield className="w-5 h-5 text-purple-400" />}
          label="Confidence"
          value={summary?.averageConfidenceScore != null ? `${summary.averageConfidenceScore.toFixed(0)}%` : "N/A"}
        />
        <SummaryCard
          icon={<ShieldAlert className="w-5 h-5 text-rose-400" />}
          label="Blocked Responses"
          value={summary?.totalBlocked ?? 0}
          warn={!!summary?.totalBlocked}
        />
      </div>

      {/* Timeline */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          Recent Evaluations
        </h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {timeline?.map((entry) => (
            <TimelineRow key={entry.id} entry={entry} />
          ))}
          {(!timeline || timeline.length === 0) && (
            <p className="text-muted-foreground text-sm">No evaluations yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white/5 border ${warn ? "border-red-500/30" : "border-white/10"} rounded-xl p-4`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${warn ? "text-red-400" : "text-white"}`}>
        {value}
      </div>
    </motion.div>
  );
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const statusColor =
    entry.overallStatus === "passed"
      ? "text-emerald-400"
      : entry.overallStatus === "warning"
        ? "text-amber-400"
        : entry.overallStatus === "blocked"
          ? "text-red-400"
          : "text-muted-foreground";

  const actionBadge =
    entry.action === "block"
      ? "bg-red-500/20 text-red-300"
      : entry.action === "rewrite"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-emerald-500/20 text-emerald-300";

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
      <span className={`text-xs font-medium w-20 ${statusColor}`}>{entry.overallStatus}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${actionBadge}`}>{entry.action}</span>
      <span className="text-xs text-muted-foreground flex-1">
        Q:{entry.qualityScore ?? "?"} H:{entry.hallucinationScore ?? "?"} C:{entry.confidenceScore ?? "?"}
      </span>
      <span className="text-xs text-muted-foreground">
        {new Date(entry.createdAt).toLocaleTimeString()}
      </span>
    </div>
  );
}
