import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, Brain, Users, Clock, AlertTriangle, Shield, BarChart3, Zap, MessageSquare } from "lucide-react";

type DashboardData = {
  dailyConsultations: number;
  totalConsultations: number;
  avgLatencyMs: number;
  avgConfidenceScore: number;
  avgQualityScore: number;
  totalSafetyInterventions: number;
  avgTokensUsed: number;
  errorRate: string;
  qualityMetrics: {
    avgConfidence: number;
    avgQuality: number;
    hallucinationIncidents: number;
    safetyViolations: number;
    retrievalSuccessRate: number;
    satisfactionScore: number;
  };
  qualityTrend: Array<{
    date: string;
    avgConfidence: number;
    avgQuality: number;
    satisfactionScore: number;
  }>;
  feedback: {
    total: number;
    helpful: number;
    notHelpful: number;
    satisfactionRate: string;
    averageScores: { accuracy: number; easeOfUnderstanding: number; helpfulness: number; trustLevel: number };
    patterns: Array<{ pattern: string; label: string; frequency: number }>;
  };
};

export function ObservabilityDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["observability-dashboard"],
    queryFn: () => fetch("/api/observability/admin/dashboard").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading dashboard...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Developer Analytics Dashboard</h2>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <MetricCard icon={<MessageSquare className="w-4 h-4" />} label="Daily" value={data?.dailyConsultations ?? 0} />
        <MetricCard icon={<Users className="w-4 h-4" />} label="Total" value={data?.totalConsultations ?? 0} />
        <MetricCard icon={<Clock className="w-4 h-4" />} label="Latency" value={`${data?.avgLatencyMs ?? 0}ms`} />
        <MetricCard icon={<Brain className="w-4 h-4" />} label="Confidence" value={`${data?.avgConfidenceScore ?? 0}%`} />
        <MetricCard icon={<Activity className="w-4 h-4" />} label="Quality" value={`${data?.avgQualityScore ?? 0}%`} />
        <MetricCard icon={<Shield className="w-4 h-4" />} label="Safety" value={data?.totalSafetyInterventions ?? 0} warn />
        <MetricCard icon={<Zap className="w-4 h-4" />} label="Tokens" value={data?.avgTokensUsed?.toLocaleString() ?? 0} />
        <MetricCard icon={<AlertTriangle className="w-4 h-4" />} label="Error Rate" value={`${data?.errorRate ?? "0"}%`} warn />
      </div>

      {/* Quality section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality metrics */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">AI Quality Metrics (Current Period)</h3>
          <div className="grid grid-cols-2 gap-4">
            {data?.qualityMetrics && (
              <>
                <QualityBar label="Avg Confidence" value={data.qualityMetrics.avgConfidence} color="#06b6d4" />
                <QualityBar label="Avg Quality" value={data.qualityMetrics.avgQuality} color="#10b981" />
                <QualityBar label="Satisfaction" value={data.qualityMetrics.satisfactionScore} color="#8b5cf6" />
                <QualityBar label="Retrieval Success" value={data.qualityMetrics.retrievalSuccessRate * 100} color="#f59e0b" />
                <StatBox label="Hallucinations" value={data.qualityMetrics.hallucinationIncidents} warn />
                <StatBox label="Safety Violations" value={data.qualityMetrics.safetyViolations} warn />
              </>
            )}
          </div>
        </div>

        {/* Feedback summary */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Feedback Summary</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatBox label="Total Feedback" value={data?.feedback?.total ?? 0} />
            <StatBox label="Helpful" value={data?.feedback?.helpful ?? 0} color="text-emerald-400" />
            <StatBox label="Not Helpful" value={data?.feedback?.notHelpful ?? 0} warn />
            <StatBox label="Satisfaction" value={`${data?.feedback?.satisfactionRate ?? "0"}%`} />
          </div>
          {data?.feedback?.averageScores && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <ScoreBadge label="Accuracy" value={data.feedback.averageScores.accuracy} />
              <ScoreBadge label="Ease of Understanding" value={data.feedback.averageScores.easeOfUnderstanding} />
              <ScoreBadge label="Helpfulness" value={data.feedback.averageScores.helpfulness} />
              <ScoreBadge label="Trust Level" value={data.feedback.averageScores.trustLevel} />
            </div>
          )}
          {data?.feedback?.patterns && data.feedback.patterns.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Common Complaint Patterns</h4>
              <div className="space-y-1">
                {data.feedback.patterns.map((p) => (
                  <div key={p.pattern} className="flex justify-between text-xs text-white/70">
                    <span>{p.label}</span>
                    <span className="text-amber-400">{p.frequency}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quality trend */}
      {data?.qualityTrend && data.qualityTrend.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Quality Trend (30 days)</h3>
          <div className="h-48 w-full relative">
            <div className="flex items-end gap-1 h-full">
              {data.qualityTrend.slice(-30).map((point, i) => (
                <TooltipWrapper key={i} label={`${new Date(point.date).toLocaleDateString()}: Q=${Math.round(point.avgQuality)} C=${Math.round(point.avgConfidence)}`}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(4, point.avgQuality || 0)}%` }}
                    className="w-3 bg-cyan-500/60 rounded-t"
                    style={{ height: `${Math.max(4, point.avgQuality || 0)}%` }}
                  />
                </TooltipWrapper>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string | number; warn?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`bg-white/5 border ${warn ? "border-amber-500/20" : "border-white/10"} rounded-xl p-3`}>
      <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold ${warn ? "text-amber-400" : "text-white"}`}>{value}</div>
    </motion.div>
  );
}

function QualityBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, value)}%` }}
          className="h-full rounded-full" style={{ background: color }} transition={{ duration: 0.8 }} />
      </div>
    </div>
  );
}

function StatBox({ label, value, warn, color }: { label: string; value: string | number; warn?: boolean; color?: string }) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${warn ? "text-amber-400" : color || "text-white"}`}>{value}</div>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between bg-white/[0.02] rounded px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-white font-medium">{(value || 0).toFixed(1)}/5</span>
    </div>
  );
}

function TooltipWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="relative group flex-1 flex items-end">{children}</div>;
}
