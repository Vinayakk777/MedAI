import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bell, AlertTriangle, Info, CheckCircle, Activity } from "lucide-react";

export function AlertCenter() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");

  const { data: alerts } = useQuery<any[]>({
    queryKey: ["alerts"],
    queryFn: () => fetch("/api/clinician/alerts").then((r) => r.json()),
    refetchInterval: 10_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => fetch(`/api/clinician/alerts/${alertId}/resolve`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (alertId: string) => fetch(`/api/clinician/alerts/${alertId}/dismiss`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const filtered = alerts?.filter((a) => filter === "all" || a.severity === filter || a.category === filter) || [];

  const activeCount = alerts?.filter((a) => a.status === "active" || a.status === "unread").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Bell className="w-6 h-6 text-rose-400" />
        <h2 className="text-xl font-bold text-white">Alert Center</h2>
        {activeCount > 0 && (
          <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">{activeCount} active</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "emergency", "high", "medium", "low"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${filter === s ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {filtered.map((alert: any) => (
          <motion.div key={alert.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border ${alert.severity === "emergency" ? "bg-red-500/10 border-red-500/30" : alert.severity === "high" ? "bg-amber-500/10 border-amber-500/30" : "bg-white/5 border-white/10"}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {alert.severity === "emergency" ? <AlertTriangle className="w-5 h-5 text-red-400" /> :
                   alert.severity === "high" ? <AlertTriangle className="w-5 h-5 text-amber-400" /> :
                   <Info className="w-5 h-5 text-blue-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white capitalize">{alert.category?.replace(/_/g, " ") || "Alert"}</span>
                    <SeverityBadge severity={alert.severity} />
                    {alert.status === "unread" && <span className="w-2 h-2 rounded-full bg-rose-400" />}
                  </div>
                  {alert.title && <p className="text-sm text-white/80 mb-0.5">{alert.title}</p>}
                  {alert.message && <p className="text-xs text-muted-foreground">{alert.message}</p>}
                  {alert.patientUserId && (
                    <p className="text-xs text-muted-foreground mt-1">Patient: {alert.patientUserId.slice(0, 12)}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{new Date(alert.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {alert.status !== "resolved" && (
                  <button onClick={() => resolveMutation.mutate(alert.id)}
                    className="text-xs text-emerald-400 hover:underline">Resolve</button>
                )}
                {alert.status !== "dismissed" && (
                  <button onClick={() => dismissMutation.mutate(alert.id)}
                    className="text-xs text-muted-foreground hover:text-white">Dismiss</button>
                )}
              </div>
            </div>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No alerts found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    emergency: "bg-red-500/20 text-red-300",
    high: "bg-amber-500/20 text-amber-300",
    medium: "bg-blue-500/20 text-blue-300",
    low: "bg-white/10 text-muted-foreground",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${styles[severity] || styles.low}`}>{severity}</span>;
}
