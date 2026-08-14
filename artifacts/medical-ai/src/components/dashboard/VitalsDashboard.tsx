import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  Heart, Wind, Thermometer, Droplets, Scale, Activity,
  AlertTriangle, TrendingUp, TrendingDown, Minus, Brain,
  ClipboardList, Gauge, Clock, FlaskConical, Syringe,
  Weight, Ruler, Monitor, Bed, Footprints, Flame,
  SmilePlus, Zap, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";

type Severity = "normal" | "mildly_abnormal" | "moderately_abnormal" | "critical";

type VitalsMetricResult = {
  value: number | null;
  severity: Severity;
  referenceRange: { min: number; max: number; unit: string; label: string };
  interpretation: string;
};

type VitalsAnalysis = {
  heartRate: VitalsMetricResult | null;
  bloodPressure: VitalsMetricResult | null;
  respiratoryRate: VitalsMetricResult | null;
  temperature: VitalsMetricResult | null;
  oxygenSaturation: VitalsMetricResult | null;
  bloodGlucose: VitalsMetricResult | null;
  bmi: VitalsMetricResult | null;
  waistCircumference: VitalsMetricResult | null;
  painScore: VitalsMetricResult | null;
};

type TrendAnalysis = {
  metric: string;
  trend: "improving" | "worsening" | "stable" | "insufficient_data";
  changePercent: number | null;
  currentValue: number | null;
  previousValue: number | null;
  insight: string;
};

type VitalsAlert = {
  metric: string;
  value: number | null;
  severity: Severity;
  contextualExplanation: string;
};

type VitalsInsightsResult = {
  assessments: VitalsAnalysis;
  trendAnalyses: TrendAnalysis[];
  alerts: VitalsAlert[];
  healthScore: number;
  healthScoreExplanation: string;
  missingMeasurements: string[];
  summary: string;
  disclaimer: string;
};

type VitalRecord = {
  id: string; heartRate: number | null; systolic: number | null; diastolic: number | null;
  temperature: string | null; respiratoryRate: number | null; oxygenSaturation: number | null;
  bloodGlucose: string | null; weight: string | null; height: string | null;
  bmi: string | null; waistCircumference: string | null; painScore: number | null;
  source: string; recordedAt: string;
};

const RANGE_OPTIONS = [
  { value: "24h", label: "24H" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "3months", label: "3M" },
  { value: "year", label: "Year" },
];

const severityConfig: Record<Severity, { color: string; bg: string; border: string; label: string }> = {
  normal:             { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Normal" },
  mildly_abnormal:   { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   label: "Mild" },
  moderately_abnormal: { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  label: "Moderate" },
  critical:          { color: "text-rose-400",     bg: "bg-rose-500/10",    border: "border-rose-500/20",    label: "Critical" },
};

const vitalCardDefs: { key: keyof VitalsAnalysis; icon: React.ElementType; label: string }[] = [
  { key: "heartRate", icon: Heart, label: "Heart Rate" },
  { key: "bloodPressure", icon: Activity, label: "Blood Pressure" },
  { key: "respiratoryRate", icon: Wind, label: "Respiratory Rate" },
  { key: "temperature", icon: Thermometer, label: "Temperature" },
  { key: "oxygenSaturation", icon: Droplets, label: "O₂ Saturation" },
  { key: "bloodGlucose", icon: FlaskConical, label: "Blood Glucose" },
  { key: "bmi", icon: Scale, label: "BMI" },
  { key: "painScore", icon: Syringe, label: "Pain Score" },
];

const trendIcons: Record<string, React.ElementType> = {
  improving: TrendingUp,
  worsening: TrendingDown,
  stable: Minus,
  insufficient_data: Minus,
};

function TrendIcon({ trend }: { trend: string }) {
  const Icon = trendIcons[trend] || Minus;
  const color = trend === "improving" ? "text-emerald-400" : trend === "worsening" ? "text-rose-400" : "text-muted-foreground/40";
  return <Icon className={`w-3 h-3 ${color}`} />;
}

function CustomTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-xs">
      <p className="text-muted-foreground font-medium mb-1">{label}</p>
      <p className="text-foreground font-bold">{payload[0]?.value} <span className="text-muted-foreground font-normal">{unit}</span></p>
    </div>
  );
}

export function VitalsDashboard() {
  const [range, setRange] = useState("month");
  const [expandedAlert, setExpandedAlert] = useState<number | null>(null);
  const [expandedTrend, setExpandedTrend] = useState<number | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const { data: insights, isLoading: insightsLoading } = useQuery<VitalsInsightsResult>({
    queryKey: ["dashboard", "vitals", "analysis"],
    queryFn: () => fetch("/api/dashboard/vitals/analysis").then((r) => r.json()),
  });

  const { data: history, isLoading: historyLoading } = useQuery<VitalRecord[]>({
    queryKey: ["dashboard", "vitals", "history", range],
    queryFn: () => fetch(`/api/dashboard/vitals/history?range=${range}`).then((r) => r.json()),
  });

  const { data: trendData, isLoading: trendLoading } = useQuery<any[]>({
    queryKey: ["dashboard", "vitals", "trends", range, selectedMetric],
    queryFn: () => fetch(`/api/dashboard/vitals/trends?range=${range}${selectedMetric ? `&metric=${selectedMetric}` : ""}`).then((r) => r.json()),
    enabled: !!selectedMetric,
  });

  const loading = insightsLoading || historyLoading;

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6 animate-pulse">
          <div className="h-5 w-48 bg-white/5 rounded mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0,1,2,3,4,5,6,7].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl" />)}
          </div>
        </div>
      </motion.div>
    );
  }

  const hasData = insights && insights.assessments && (Object.values(insights.assessments).some(v => v != null) || insights.healthScore > 0);
  const isEmpty = !hasData;

  if (isEmpty) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Vital Signs & Health Metrics</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">No vitals recorded yet</p>
        <div className="text-center py-8">
          <Activity className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground/50">Record your first set of vital signs to unlock analysis, trends, and insights.</p>
        </div>
      </motion.div>
    );
  }

  const hasDemoData = (history ?? []).some((r) => r.source === "demo");

  const a = insights!.assessments;
  const healthScore = insights!.healthScore;
  const healthScoreColor = healthScore >= 80 ? "text-emerald-400" : healthScore >= 60 ? "text-amber-400" : healthScore >= 40 ? "text-orange-400" : "text-rose-400";
  const healthScoreBg = healthScore >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : healthScore >= 60 ? "bg-amber-500/10 border-amber-500/20" : healthScore >= 40 ? "bg-orange-500/10 border-orange-500/20" : "bg-rose-500/10 border-rose-500/20";

  function getAlertCount(severity: Severity): number {
    return insights!.alerts.filter(x => x.severity === severity).length;
  }

  const chartData = (trendData ?? (history ?? []).slice().reverse().slice(-14)).map((r: any) => ({
    day: new Date(r.date || r.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: r.value ?? r.heartRate ?? 0,
  }));

  const metricOptions = [
    { value: "", label: "Heart Rate" },
    { value: "systolic", label: "Systolic BP" },
    { value: "diastolic", label: "Diastolic BP" },
    { value: "temperature", label: "Temperature" },
    { value: "oxygenSaturation", label: "O₂ Saturation" },
    { value: "bloodGlucose", label: "Blood Glucose" },
    { value: "weight", label: "Weight" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {hasDemoData && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            <strong className="font-semibold text-amber-300">Simulated demo data.</strong>{" "}
            These vitals were synced in demo mode — they are not your real health readings. Connect a real
            Google Health account to see your actual vitals.
          </p>
        </div>
      )}

      {/* Summary + Health Score */}
      <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Vital Signs & Health Metrics</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{insights!.summary}</p>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          <div className={`lg:col-span-1 rounded-xl border ${healthScoreBg} p-4 flex flex-col items-center justify-center`}>
            <Gauge className={`w-5 h-5 ${healthScoreColor} mb-1`} />
            <span className={`text-2xl font-bold ${healthScoreColor}`}>{healthScore}</span>
            <span className={`text-[10px] font-medium ${healthScoreColor}`}>Health Score</span>
          </div>

          <div className="lg:col-span-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/4 p-3 text-center">
              <AlertTriangle className="w-4 h-4 text-rose-400 mx-auto mb-1" />
              <span className="text-lg font-bold text-foreground">{getAlertCount("critical") + getAlertCount("moderately_abnormal")}</span>
              <p className="text-[10px] text-muted-foreground/60">Alerts</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/4 p-3 text-center">
              <ClipboardList className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <span className="text-lg font-bold text-foreground">{insights!.missingMeasurements.length}</span>
              <p className="text-[10px] text-muted-foreground/60">Missing</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/4 p-3 text-center">
              <Brain className="w-4 h-4 text-violet-400 mx-auto mb-1" />
              <span className="text-lg font-bold text-foreground">{insights!.trendAnalyses.filter(t => t.trend !== "insufficient_data").length}</span>
              <p className="text-[10px] text-muted-foreground/60">Trends</p>
            </div>
          </div>
        </div>

        {insights!.healthScoreExplanation && (
          <p className="text-xs text-muted-foreground/60 leading-relaxed">{insights!.healthScoreExplanation}</p>
        )}
      </div>

      {/* Current Vitals Grid */}
      <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-foreground">Current Vitals</h3>
            </div>
            <p className="text-xs text-muted-foreground">Last reading: {history?.[0]?.recordedAt ? new Date(history[0].recordedAt).toLocaleString() : "N/A"}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {vitalCardDefs.map((def) => {
            const result = a[def.key];
            const Icon = def.icon;
            const sev = result?.severity ?? "normal";
            const sevCfg = severityConfig[sev];

            let displayValue: string;
            if (def.key === "bloodPressure" && a.bloodPressure?.value != null) {
              const bp = a.bloodPressure;
              displayValue = `${bp.value}/${a.bloodPressure.referenceRange?.max ?? "?"}`;
              displayValue = `${history?.[0]?.systolic ?? "—"}/${history?.[0]?.diastolic ?? "—"}`;
            } else if (result?.value != null) {
              displayValue = String(def.key === "temperature" ? (result.value * 9/5 + 32).toFixed(1) : result.value);
            } else {
              displayValue = "—";
            }

            return (
              <div key={def.key} className={`rounded-xl border ${sevCfg.border} ${sevCfg.bg} p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${sevCfg.color}`} />
                  <span className="text-[10px] font-medium text-muted-foreground">{def.label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-foreground tabular-nums">{displayValue}</span>
                  {result?.referenceRange?.unit && displayValue !== "—" && (
                    <span className="text-[10px] text-muted-foreground/50">{result.referenceRange.unit}</span>
                  )}
                </div>
                <span className={`text-[9px] font-semibold ${sevCfg.color}`}>{sevCfg.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend Chart */}
      <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Trend Timeline</h3>
            </div>
            <p className="text-xs text-muted-foreground">Historical measurements over time</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMetric ?? ""}
              onChange={e => setSelectedMetric(e.target.value || null)}
              className="bg-background/60 border border-white/8 rounded-lg text-[11px] text-muted-foreground px-2 py-1.5 focus:outline-none focus:border-primary/30"
            >
              {metricOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="flex items-center gap-1 bg-background/60 rounded-xl p-1 border border-white/5">
              {RANGE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setRange(opt.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                    range === opt.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}>{opt.label}</button>
              ))}
            </div>
          </div>
        </div>

        {trendLoading ? (
          <div className="h-[200px] animate-pulse bg-white/5 rounded-xl" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={(p) => <CustomTooltip {...p} unit="" />} />
              <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fill="url(#trendGrad)" dot={{ fill: "#06b6d4", strokeWidth: 0, r: 3 }} activeDot={{ r: 5, fill: "#06b6d4", strokeWidth: 2, stroke: "hsl(var(--background))" }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-xs text-muted-foreground/40">Select a metric and time range to view trends</p>
          </div>
        )}
      </div>

      {/* Trend Analysis */}
      {insights!.trendAnalyses.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">Trend Analysis</h3>
          </div>
          <div className="space-y-2">
            {insights!.trendAnalyses.filter(t => t.currentValue != null).slice(0, 8).map((t, i) => (
              <div key={t.metric}>
                <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/4 cursor-pointer transition-colors"
                  onClick={() => setExpandedTrend(expandedTrend === i ? null : i)}>
                  <TrendIcon trend={t.trend} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{t.metric}</span>
                      <span className={`text-[10px] font-medium capitalize ${
                        t.trend === "improving" ? "text-emerald-400" : t.trend === "worsening" ? "text-rose-400" : "text-muted-foreground/40"
                      }`}>{t.trend.replace("_", " ")}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                      <span>Current: {t.currentValue ?? "—"}</span>
                      {t.previousValue != null && <span>Previous: {t.previousValue}</span>}
                      {t.changePercent != null && <span>({t.changePercent > 0 ? "+" : ""}{t.changePercent.toFixed(1)}%)</span>}
                    </div>
                  </div>
                  {(expandedTrend === i ? ChevronUp : ChevronDown) && (
                    expandedTrend === i ? <ChevronUp className="w-3 h-3 text-muted-foreground/30" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/30" />
                  )}
                </div>
                <AnimatePresence>
                  {expandedTrend === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="pl-9 pr-3 pb-2">
                      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">{t.insight}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {insights!.alerts.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <h3 className="text-sm font-semibold text-foreground">Health Alerts</h3>
          </div>
          <div className="space-y-2">
            {insights!.alerts.map((alert, i) => {
              const sev = severityConfig[alert.severity];
              const isExpanded = expandedAlert === i;
              return (
                <div key={i} className={`rounded-xl border ${sev.border} ${sev.bg} overflow-hidden`}>
                  <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => setExpandedAlert(isExpanded ? null : i)}>
                    <AlertTriangle className={`w-4 h-4 ${sev.color} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">{alert.metric}</span>
                        <span className={`text-[10px] font-semibold ${sev.color} ${sev.bg} px-1.5 py-0.5 rounded-full`}>{sev.label}</span>
                      </div>
                      {alert.value != null && <p className="text-[10px] text-muted-foreground/60 mt-0.5">Value: {alert.value}</p>}
                    </div>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/30" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/30" />}
                  </div>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/5 px-3 py-2.5">
                        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{alert.contextualExplanation}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Missing Measurements */}
      {insights!.missingMeasurements.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">Missing Measurements</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {insights!.missingMeasurements.map(m => (
              <span key={m} className="text-[10px] text-muted-foreground/60 bg-white/5 border border-white/8 px-2.5 py-1 rounded-full">{m}</span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-2">Recording these measurements will improve your health score accuracy.</p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4">
        <button onClick={() => setShowDisclaimer(!showDisclaimer)}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors">
          <AlertTriangle className="w-3 h-3" />
          Medical disclaimer {showDisclaimer ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        </button>
        <AnimatePresence>
          {showDisclaimer && (
            <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="text-[10px] text-muted-foreground/30 leading-relaxed mt-2 overflow-hidden">
              {insights!.disclaimer}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
