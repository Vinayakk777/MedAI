import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bell, Plus, Trash2, AlertTriangle, CheckCircle, Clock, Eye, EyeOff } from "lucide-react";

export function AlertConfiguration() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newConfig, setNewConfig] = useState({ name: "", metric: "hallucination_rate", operator: "gt", threshold: 50, severity: "warning", channels: ["email"], windowMinutes: 60, cooldownMinutes: 30 });

  const { data: configs } = useQuery<any[]>({
    queryKey: ["alert-configs"],
    queryFn: () => fetch("/api/observability/alerts/configs").then((r) => r.json()),
  });

  const { data: alertHistory } = useQuery<any[]>({
    queryKey: ["alert-history"],
    queryFn: () => fetch("/api/observability/alerts/history?limit=50").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () => fetch("/api/observability/alerts/configs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newConfig) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alert-configs"] }); setShowCreate(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/observability/alerts/configs/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-configs"] }),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/observability/alerts/${id}/resolve`, { method: "PUT" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-history"] }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Alert Configuration</h2>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/30">
          <Plus className="w-4 h-4" /> New Alert
        </button>
      </div>

      {showCreate && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className="bg-white/5 border border-white/10 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <input value={newConfig.name} onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })} placeholder="Alert name" className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm" />
          <select value={newConfig.metric} onChange={(e) => setNewConfig({ ...newConfig, metric: e.target.value })} className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm">
            <option value="hallucination_rate">Hallucination Rate</option>
            <option value="safety_violations">Safety Violations</option>
            <option value="provider_outage">Provider Outage</option>
            <option value="latency_spike">Latency Spike</option>
            <option value="retrieval_failures">Retrieval Failures</option>
            <option value="satisfaction_drop">Satisfaction Drop</option>
          </select>
          <select value={newConfig.operator} onChange={(e) => setNewConfig({ ...newConfig, operator: e.target.value })} className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm">
            <option value="gt">&gt; (greater than)</option>
            <option value="gte">&gt;= (greater or equal)</option>
            <option value="lt">&lt; (less than)</option>
            <option value="lte">&lt;= (less or equal)</option>
          </select>
          <input type="number" value={newConfig.threshold} onChange={(e) => setNewConfig({ ...newConfig, threshold: Number(e.target.value) })} placeholder="Threshold" className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm" />
          <select value={newConfig.severity} onChange={(e) => setNewConfig({ ...newConfig, severity: e.target.value })} className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm">
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <input type="number" value={newConfig.windowMinutes} onChange={(e) => setNewConfig({ ...newConfig, windowMinutes: Number(e.target.value) })} placeholder="Window (min)" className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm" />
          <button onClick={() => createMutation.mutate()} disabled={!newConfig.name}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 disabled:opacity-50 col-span-2">
            Create Alert Rule
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config list */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Alert Rules</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {configs?.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/10">
                <div className={`w-2 h-2 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-gray-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white font-medium">{c.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${c.severity === "critical" ? "bg-red-500/20 text-red-300" : c.severity === "warning" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
                      {c.severity}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.metric} {c.operator} {c.threshold} (window: {c.windowMinutes}m)</p>
                </div>
                <button onClick={() => deleteMutation.mutate(c.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {(!configs || configs.length === 0) && <p className="text-sm text-muted-foreground">No alert rules configured.</p>}
          </div>
        </div>

        {/* Alert history */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Alert History</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {alertHistory?.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/10">
                <div className={`mt-1 ${a.severity === "critical" ? "text-red-400" : a.severity === "warning" ? "text-amber-400" : "text-blue-400"}`}>
                  {a.severity === "critical" ? <AlertTriangle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{a.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{a.metric}: {a.metricValue} (threshold: {a.threshold})</span>
                    <span><Clock className="w-3 h-3 inline" /> {new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!a.isResolved ? (
                    <button onClick={() => resolveMutation.mutate(a.id)} className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/30">
                      Resolve
                    </button>
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
              </div>
            ))}
            {(!alertHistory || alertHistory.length === 0) && <p className="text-sm text-muted-foreground">No alerts fired.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
