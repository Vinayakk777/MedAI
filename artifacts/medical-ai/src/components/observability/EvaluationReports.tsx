import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Beaker, CheckCircle, XCircle, BarChart3, Clock, Activity } from "lucide-react";

export function EvaluationReports() {
  const { data: runs, isLoading } = useQuery<any[]>({
    queryKey: ["evaluation-runs"],
    queryFn: () => fetch("/api/observability/evaluations/runs").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading evaluations...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Beaker className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Evaluation Pipeline Reports</h2>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={<Beaker className="w-5 h-5" />} label="Total Runs" value={runs?.length ?? 0} />
        <MetricCard icon={<CheckCircle className="w-5 h-5" />} label="Avg Pass Rate"
          value={runs?.length ? `${(runs.reduce((s: number, r: any) => s + (r.passed / r.totalScenarios * 100), 0) / runs.length).toFixed(1)}%` : "—"} />
        <MetricCard icon={<Activity className="w-5 h-5" />} label="Avg Accuracy"
          value={runs?.length ? `${(runs.reduce((s: number, r: any) => s + (r.avgAccuracy ?? 0), 0) / runs.length).toFixed(1)}%` : "—"} />
        <MetricCard icon={<Clock className="w-5 h-5" />} label="Avg Latency"
          value={runs?.length ? `${Math.round(runs.reduce((s: number, r: any) => s + (r.avgLatencyMs ?? 0), 0) / runs.length)}ms` : "—"} />
      </div>

      {/* Runs */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Evaluation Runs</h3>
        {runs && runs.length > 0 ? (
          <div className="space-y-3">
            {runs.map((run: any, i: number) => {
              const passRate = run.totalScenarios > 0 ? (run.passed / run.totalScenarios) * 100 : 0;
              return (
                <motion.div key={run.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-medium text-white">{run.name}</h4>
                      <p className="text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()} — {run.triggeredBy || "manual"}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${run.status === "completed" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                      {run.status}
                    </span>
                  </div>

                  {/* Pass rate bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Pass Rate</span>
                      <span>{passRate.toFixed(1)}% ({run.passed}/{run.totalScenarios})</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${passRate}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" transition={{ duration: 0.6 }} />
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {run.avgAccuracy != null && <MiniMetric label="Accuracy" value={`${run.avgAccuracy.toFixed(1)}%`} />}
                    {run.avgSafetyScore != null && <MiniMetric label="Safety" value={`${run.avgSafetyScore.toFixed(1)}%`} />}
                    {run.avgDiagnosisConsistency != null && <MiniMetric label="Consistency" value={`${run.avgDiagnosisConsistency.toFixed(1)}%`} />}
                    {run.avgFollowUpQuality != null && <MiniMetric label="Follow-Up" value={`${run.avgFollowUpQuality.toFixed(1)}%`} />}
                    {run.avgLatencyMs != null && <MiniMetric label="Latency" value={`${run.avgLatencyMs.toFixed(0)}ms`} />}
                    <MiniMetric label="Failed" value={run.failed} warn />
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No evaluation runs yet. Run an evaluation from the pipeline to see results.
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-2.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold ${warn ? "text-red-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
