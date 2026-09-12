import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Heart, Wind, Thermometer, Droplets, Scale, Activity,
  AlertTriangle, TrendingUp, TrendingDown, Minus, Brain,
  ClipboardList, Gauge, FlaskConical, Syringe,
  ChevronDown, ChevronUp, Plus,
} from "lucide-react";
import { ManualVitalsForm } from "./ManualVitalsForm";

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
  painScore: VitalsMetricResult | null;
};

type VitalsInsightsResult = {
  assessments: VitalsAnalysis;
  alerts: { severity: Severity; metric: string; message: string; contextualExplanation: string }[];
  trendAnalyses: { metric: string; trend: string; summary: string }[];
  missingMeasurements: string[];
  healthScore: number;
  healthScoreExplanation: string;
  summary: string;
  disclaimer: string;
};

type VitalRecord = {
  id: string;
  heartRate: number | null;
  systolic: number | null;
  diastolic: number | null;
  respiratoryRate: number | null;
  temperature: number | null;
  oxygenSaturation: number | null;
  bloodGlucose: number | null;
  weight: number | null;
  height: number | null;
  painScore: number | null;
  source: string;
  recordedAt: string;
};

const RANGE_OPTIONS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "3month", label: "3M" },
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
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  const { data: insights, isLoading: insightsLoading } = useQuery<VitalsInsightsResult>({
    queryKey: ["dashboard", "vitals", "analysis"],
    queryFn: () => fetch("/api/dashboard/vitals/analysis").then((r) => r.json()),
  });

  const { data: history, isLoading: historyLoading } = useQuery<VitalRecord[]>({
    queryKey: ["dashboard", "vitals", "history", range],
    queryFn: () => fetch(`/api/dashboard/vitals/history?range=${range}`).then((r) => r.json()),
  });

  const { data: trendData } = useQuery<any[]>({
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

      {/* LOG VITALS BUTTON - ALWAYS VISIBLE */}
      <div className="rounded-2xl border border-emerald-500/30 bg-[#0f1117] p-4">
        <button
          onClick={() => setShowManualEntry(!showManualEntry)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold text-white">Log Vital Signs</span>
          </div>
          {showManualEntry ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </button>
        <p className="text-[11px] text-white/40 mt-1 text-left">Enter blood sugar, BP, heart rate, temperature, and more. AI will analyze if your readings are safe.</p>
      </div>

      {/* MANUAL ENTRY FORM - DIRECTLY RENDERED */}
      {showManualEntry && (
        <ManualVitalsForm onDone={() => setShowManualEntry(false)} />
      )}

      {/* DEMO DATA WARNING */}
      {history && history.some((r) => r.source === "demo") && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            <strong className="font-semibold text-amber-300">Simulated demo data.</strong>{" "}
            These vitals were synced in demo mode — not your real health readings.
          </p>
        </div>
      )}

      {/* HEALTH SCORE + SUMMARY */}
      {hasData && insights && (
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-foreground">Vital Signs & Health Metrics</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{insights.summary}</p>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            <div className={`lg:col-span-1 rounded-xl border ${insights.healthScore >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : insights.healthScore >= 60 ? "bg-amber-500/10 border-amber-500/20" : "bg-rose-500/10 border-rose-500/20"} p-4 flex flex-col items-center justify-center`}>
              <Gauge className={`w-5 h-5 ${insights.healthScore >= 80 ? "text-emerald-400" : insights.healthScore >= 60 ? "text-amber-400" : "text-rose-400"} mb-1`} />
              <span className={`text-2xl font-bold ${insights.healthScore >= 80 ? "text-emerald-400" : insights.healthScore >= 60 ? "text-amber-400" : "text-rose-400"}`}>{insights.healthScore}</span>
              <span className="text-[10px] font-medium text-muted-foreground/60">Health Score</span>
            </div>
            <div className="lg:col-span-3 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/5 bg-white/4 p-3 text-center">
                <AlertTriangle className="w-4 h-4 text-rose-400 mx-auto mb-1" />
                <span className="text-lg font-bold text-foreground">{insights.alerts.length}</span>
                <p className="text-[10px] text-muted-foreground/60">Alerts</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/4 p-3 text-center">
                <ClipboardList className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <span className="text-lg font-bold text-foreground">{insights.missingMeasurements.length}</span>
                <p className="text-[10px] text-muted-foreground/60">Missing</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/4 p-3 text-center">
                <Brain className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                <span className="text-lg font-bold text-foreground">{insights.trendAnalyses.filter(t => t.trend !== "insufficient_data").length}</span>
                <p className="text-[10px] text-muted-foreground/60">Trends</p>
              </div>
            </div>
          </div>

          {insights.healthScoreExplanation && (
            <p className="text-xs text-muted-foreground/60 leading-relaxed">{insights.healthScoreExplanation}</p>
          )}
        </div>
      )}

      {/* CURRENT VITALS GRID */}
      {hasData && insights && (
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-foreground">Current Vitals</h3>
            </div>
            <span className="text-[10px] text-muted-foreground/50">Last: {history?.[0]?.recordedAt ? new Date(history[0].recordedAt).toLocaleString() : "N/A"}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {vitalCardDefs.map((def) => {
              const result = insights.assessments[def.key];
              const Icon = def.icon;
              const sev = result?.severity ?? "normal";
              const sevCfg = severityConfig[sev];
              let displayValue: string;
              if (def.key === "bloodPressure" && history?.[0]) {
                displayValue = `${history[0].systolic ?? "—"}/${history[0].diastolic ?? "—"}`;
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
      )}

      {/* TREND CHART */}
      {hasData && (
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Trend Timeline</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select
              value={selectedMetric ?? ""}
              onChange={e => setSelectedMetric(e.target.value || null)}
              className="bg-background/60 border border-white/8 rounded-lg text-[11px] text-muted-foreground px-2 py-1.5 focus:outline-none focus:border-primary/30"
            >
              <option value="">Heart Rate</option>
              <option value="systolic">Systolic BP</option>
              <option value="diastolic">Diastolic BP</option>
              <option value="temperature">Temperature</option>
              <option value="oxygenSaturation">O₂ Saturation</option>
              <option value="bloodGlucose">Blood Glucose</option>
              <option value="weight">Weight</option>
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
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={(trendData ?? (history ?? []).slice().reverse().slice(-14)).map((r: any) => ({
                day: new Date(r.date || r.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                value: r.value ?? r.heartRate ?? 0,
              }))}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                <Tooltip content={<CustomTooltip unit="" />} />
                <Area type="monotone" dataKey="value" stroke="#06b6d4" fill="url(#colorValue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* MISSING MEASUREMENTS */}
      {insights && insights.missingMeasurements.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">Missing Measurements</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {insights.missingMeasurements.map(m => (
              <span key={m} className="text-[10px] text-muted-foreground/60 bg-white/5 border border-white/8 px-2.5 py-1 rounded-full">{m}</span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/40 mt-2">Recording these measurements will improve your health score accuracy.</p>
        </div>
      )}

      {/* DISCLAIMER */}
      {insights && (
        <div className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4">
          <button onClick={() => setShowDisclaimer(!showDisclaimer)}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors">
            <AlertTriangle className="w-3 h-3" />
            Medical disclaimer {showDisclaimer ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
          {showDisclaimer && (
            <p className="text-[10px] text-muted-foreground/30 leading-relaxed mt-2">{insights.disclaimer}</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
