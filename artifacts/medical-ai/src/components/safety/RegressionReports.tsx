import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FileText, Play, CheckCircle, XCircle, AlertTriangle, Clock, Brain, Shield } from "lucide-react";

type RegressionRun = {
  id: string;
  suiteName: string;
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  hallucinationCount: number;
  safetyViolations: number;
  avgLatencyMs: number;
  avgConfidence: number;
  createdAt: string;
  reportData?: any;
};

export function RegressionReports() {
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const { data: runs, isLoading, refetch } = useQuery<RegressionRun[]>({
    queryKey: ["regression-runs"],
    queryFn: () => fetch("/api/safety-admin/regression/runs").then((r) => r.json()),
  });

  const runTestsMutation = useMutation({
    mutationFn: () =>
      fetch("/api/safety-admin/regression/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suiteName: "manual_regression_run" }),
      }).then((r) => r.json()),
    onSuccess: () => refetch(),
  });

  const selectedRunData = runs?.find((r) => r.id === selectedRun);
  const reportData = selectedRunData?.reportData;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Regression Test Reports</h2>
        </div>
        <button
          onClick={() => runTestsMutation.mutate()}
          disabled={runTestsMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {runTestsMutation.isPending ? "Running..." : "Run All Tests"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run list */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 lg:col-span-1">
          <h3 className="text-sm font-semibold text-white mb-3">Test Runs</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {runs?.map((run) => (
              <button
                key={run.id}
                onClick={() => setSelectedRun(run.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedRun === run.id
                    ? "bg-cyan-500/10 border-cyan-500/30"
                    : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white">{run.suiteName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    run.status === "completed" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                  }`}>
                    {run.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{run.passed}/{run.totalTests} passed</span>
                  <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
            {(!runs || runs.length === 0) && (
              <p className="text-sm text-muted-foreground">No test runs yet.</p>
            )}
          </div>
        </div>

        {/* Run detail */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 lg:col-span-2">
          {selectedRunData ? (
            <div className="space-y-5">
              <h3 className="text-lg font-bold text-white">{selectedRunData.suiteName}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricBox icon={<CheckCircle className="w-4 h-4 text-emerald-400" />} label="Passed" value={selectedRunData.passed} />
                <MetricBox icon={<XCircle className="w-4 h-4 text-red-400" />} label="Failed" value={selectedRunData.failed} warn />
                <MetricBox icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} label="Warnings" value={selectedRunData.warnings} />
                <MetricBox icon={<Brain className="w-4 h-4 text-purple-400" />} label="Hallucinations" value={selectedRunData.hallucinationCount} warn />
                <MetricBox icon={<Shield className="w-4 h-4 text-rose-400" />} label="Safety Violations" value={selectedRunData.safetyViolations} warn />
                <MetricBox icon={<Clock className="w-4 h-4 text-blue-400" />} label="Avg Latency" value={`${selectedRunData.avgLatencyMs?.toFixed(0) ?? "?"}ms`} />
              </div>

              {/* Pass rate bar */}
              {selectedRunData.totalTests > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Pass Rate</span>
                    <span>{((selectedRunData.passed / selectedRunData.totalTests) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(selectedRunData.passed / selectedRunData.totalTests) * 100}%` }}
                      className="h-full rounded-full bg-emerald-500"
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              Select a test run to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricBox({
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
    <div className={`bg-white/[0.03] border ${warn && Number(value) > 0 ? "border-amber-500/20" : "border-white/10"} rounded-lg p-3`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-bold ${warn && Number(value) > 0 ? "text-amber-400" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}
