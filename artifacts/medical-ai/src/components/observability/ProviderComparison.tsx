import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Cpu, Clock, DollarSign, Zap, AlertTriangle, BarChart3 } from "lucide-react";

export function ProviderComparison() {
  const { data: providers, isLoading } = useQuery<any[]>({
    queryKey: ["provider-comparison"],
    queryFn: () => fetch("/api/observability/providers/comparison").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const { data: logs } = useQuery<any[]>({
    queryKey: ["provider-logs"],
    queryFn: () => fetch("/api/observability/providers/logs?limit=50").then((r) => r.json()),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading provider data...</div>;

  const bestLatency = providers?.length ? providers.reduce((a: any, b: any) => a.avgLatencyMs < b.avgLatencyMs ? a : b) : null;
  const bestCost = providers?.length ? providers.reduce((a: any, b: any) => a.avgCostPerCall < b.avgCostPerCall ? a : b) : null;
  const bestReliability = providers?.length ? providers.reduce((a: any, b: any) => a.failureRate < b.failureRate ? a : b) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Cpu className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Provider Performance Comparison</h2>
      </div>

      {/* Best picks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BestPick icon={<Clock className="w-5 h-5" />} label="Best Latency" provider={bestLatency?.provider} model={bestLatency?.model} value={`${bestLatency?.avgLatencyMs ?? "?"}ms`} />
        <BestPick icon={<DollarSign className="w-5 h-5" />} label="Best Cost" provider={bestCost?.provider} model={bestCost?.model} value={`$${bestCost?.avgCostPerCall?.toFixed(5) ?? "?"}`} />
        <BestPick icon={<Zap className="w-5 h-5" />} label="Most Reliable" provider={bestReliability?.provider} model={bestReliability?.model} value={`${bestReliability?.failureRate?.toFixed(1) ?? "?"}% fail`} />
      </div>

      {/* Provider table */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <h3 className="text-sm font-semibold text-white p-5 pb-3">Provider Metrics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="text-left p-3 pl-5">Provider</th>
                <th className="text-right p-3">Model</th>
                <th className="text-right p-3">Calls</th>
                <th className="text-right p-3">Avg Latency</th>
                <th className="text-right p-3">P95</th>
                <th className="text-right p-3">P99</th>
                <th className="text-right p-3">Failure Rate</th>
                <th className="text-right p-3 pr-5">Avg Cost</th>
              </tr>
            </thead>
            <tbody>
              {providers?.map((p: any, i: number) => (
                <motion.tr key={p.provider + p.model} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 pl-5 font-medium text-white">
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${p.failureRate < 1 ? "bg-emerald-400" : p.failureRate < 5 ? "bg-amber-400" : "bg-red-400"}`} />
                    {p.provider}
                  </td>
                  <td className="p-3 text-right text-muted-foreground font-mono text-xs">{p.model}</td>
                  <td className="p-3 text-right text-white">{p.totalCalls}</td>
                  <td className={`p-3 text-right font-mono ${p.avgLatencyMs === bestLatency?.avgLatencyMs ? "text-emerald-400" : "text-white"}`}>
                    {p.avgLatencyMs}ms
                  </td>
                  <td className="p-3 text-right text-muted-foreground font-mono">{p.p95LatencyMs}ms</td>
                  <td className="p-3 text-right text-muted-foreground font-mono">{p.p99LatencyMs}ms</td>
                  <td className={`p-3 text-right font-mono ${p.failureRate < 1 ? "text-emerald-400" : p.failureRate < 5 ? "text-amber-400" : "text-red-400"}`}>
                    {p.failureRate.toFixed(2)}%
                  </td>
                  <td className="p-3 pr-5 text-right font-mono text-cyan-400">${p.avgCostPerCall.toFixed(5)}</td>
                </motion.tr>
              ))}
              {(!providers || providers.length === 0) && (
                <tr><td colSpan={8} className="p-5 text-center text-muted-foreground">No provider data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent call logs */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Recent Provider Calls</h3>
        {logs && logs.length > 0 ? (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {logs.map((log: any) => (
              <div key={log.id} className="flex items-center gap-3 text-xs p-2 rounded hover:bg-white/[0.02]">
                <span className={`w-2 h-2 rounded-full ${log.success ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="text-white font-medium w-20">{log.provider}/{log.model}</span>
                <span className="text-muted-foreground w-16">{log.taskType || "generation"}</span>
                <span className="text-muted-foreground w-20">{log.latencyMs}ms</span>
                {log.cost != null && <span className="text-cyan-400 w-16">${log.cost.toFixed(5)}</span>}
                {!log.success && <span className="text-red-400 flex-1">{log.errorType || "error"}</span>}
                <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">No logs yet.</p>}
      </div>
    </div>
  );
}

function BestPick({ icon, label, provider, model, value }: { icon: React.ReactNode; label: string; provider: string; model: string; value: string }) {
  return (
    <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/5 border border-cyan-500/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-cyan-400">{icon}<span className="text-xs uppercase tracking-wider">{label}</span></div>
      <div className="text-lg font-bold text-white mb-1">{provider || "—"}</div>
      <div className="text-xs text-muted-foreground mb-1">{model || ""}</div>
      <div className="text-sm text-cyan-400 font-mono">{value}</div>
    </div>
  );
}
