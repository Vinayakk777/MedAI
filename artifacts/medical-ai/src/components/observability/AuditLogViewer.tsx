import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Shield, FileText, Settings, RefreshCw, AlertTriangle, User } from "lucide-react";

export function AuditLogViewer() {
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["audit-logs"],
    queryFn: () => fetch("/api/observability/admin/audit-logs?limit=100").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery<any>({
    queryKey: ["audit-summary"],
    queryFn: () => fetch("/api/observability/admin/audit-summary").then((r) => r.json()),
  });

  const actionIcons: Record<string, React.ReactNode> = {
    prompt_created: <FileText className="w-4 h-4 text-cyan-400" />,
    prompt_activated: <RefreshCw className="w-4 h-4 text-emerald-400" />,
    prompt_rolled_back: <RefreshCw className="w-4 h-4 text-amber-400" />,
    alert_modified: <Settings className="w-4 h-4 text-purple-400" />,
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading audit logs...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Compliance & Audit Logs</h2>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SumCard icon={<Shield className="w-5 h-5" />} label="Total Events" value={summary.total} />
          {summary.actions?.slice(0, 3).map((a: any) => (
            <SumCard key={a.action} icon={actionIcons[a.action] || <AlertTriangle className="w-5 h-5" />}
              label={a.action.replace(/_/g, " ")} value={a.count} />
          ))}
        </div>
      )}

      {/* Audit log table */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <h3 className="text-sm font-semibold text-white p-5 pb-3">Audit Trail (Immutable)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="text-left p-3 pl-5">Timestamp</th>
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">Resource</th>
                <th className="text-left p-3">User</th>
                <th className="text-left p-3">Changes</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((log: any, i: number) => (
                <motion.tr key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="p-3 pl-5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {actionIcons[log.action] || <User className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-white text-xs">{log.action.replace(/_/g, " ")}</span>
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    <span className="text-muted-foreground">{log.resourceType}</span>
                    {log.resourceId && <span className="text-cyan-400 font-mono ml-2">#{log.resourceId.slice(0, 8)}</span>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{log.userId?.slice(0, 16) || "system"}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                    {log.changes ? JSON.stringify(log.changes).slice(0, 80) + "..." : "—"}
                  </td>
                </motion.tr>
              ))}
              {(!logs || logs.length === 0) && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No audit log entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-cyan-400 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-white mb-1">Privacy & Compliance Notice</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• All audit logs are immutable and append-only</li>
              <li>• PHI is automatically redacted from change tracking</li>
              <li>• Anonymized operational events are stored separately from medical data</li>
              <li>• Data retention policies can be configured per event type</li>
              <li>• User deletion requests will be processed in compliance with applicable regulations</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function SumCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">{icon}<span className="text-xs capitalize">{label}</span></div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}
