import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, ReferenceLine,
} from "recharts";
import {
  HeartPulse, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Activity,
} from "lucide-react";

type VitalTrend = {
  metric: string;
  label: string;
  values: { date: string; value: number }[];
  average: number | null;
  min: number | null;
  max: number | null;
  trend: string;
  changePercent: number | null;
  significance?: string;
};

const METRICS = [
  { key: "heartRate", label: "Heart Rate", unit: "bpm", color: "#f43f5e", range: [60, 100] },
  { key: "systolic", label: "Systolic BP", unit: "mmHg", color: "#06b6d4", range: [90, 120] },
  { key: "oxygenSaturation", label: "O₂ Sat", unit: "%", color: "#10b981", range: [95, 100] },
  { key: "bloodGlucose", label: "Blood Glucose", unit: "mg/dL", color: "#f59e0b", range: [70, 140] },
  { key: "weight", label: "Weight", unit: "kg", color: "#8b5cf6", range: null },
  { key: "painScore", label: "Pain Score", unit: "/10", color: "#f97316", range: [0, 3] },
] as const;

export function VitalTrendsPanel() {
  const [activeMetric, setActiveMetric] = useState<string>("heartRate");

  const { data, isLoading, error } = useQuery<VitalTrend[]>({
    queryKey: ["wellness-vital-trends"],
    queryFn: () => fetch("/api/wellness/vital-trends").then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-white/5 rounded" />
          <div className="h-40 bg-white/5 rounded" />
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-rose-500/15 bg-rose-500/5 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-foreground">Vital Sign Trends</h3>
        </div>
        <p className="text-xs text-muted-foreground">Failed to load vital data.</p>
      </motion.div>
    );
  }

  const trends = data ?? [];
  const activeData = trends.find((t) => t.metric === activeMetric);
  const activeConfig = METRICS.find((m) => m.key === activeMetric);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <HeartPulse className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Vital Sign Trends</h3>
      </div>

      {/* Metric selector tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setActiveMetric(m.key)}
            className={`px-2.5 py-1.5 text-[10px] rounded-lg border transition-all ${
              activeMetric === m.key
                ? "bg-primary/12 text-primary border-primary/20"
                : "text-muted-foreground/50 hover:text-foreground border-white/5 hover:bg-white/5"
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Main chart */}
      {activeData && activeData.values.length > 0 ? (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">{activeData.label}</span>
              {activeData.trend === "increasing" && <TrendingUp className="w-3.5 h-3.5 text-rose-400" />}
              {activeData.trend === "decreasing" && <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />}
              {activeData.trend === "stable" && <Minus className="w-3.5 h-3.5 text-muted-foreground/50" />}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
              <span>Avg: {activeData.average ?? "—"}</span>
              {activeConfig && <span>Normal: {activeConfig.range ? `${activeConfig.range[0]}-${activeConfig.range[1]}` : "—"}</span>}
            </div>
          </div>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeData.values.map((v) => ({
                date: new Date(v.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                value: v.value,
              }))}>
                <defs>
                  <linearGradient id="vitalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={activeConfig?.color ?? "#06b6d4"} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={activeConfig?.color ?? "#06b6d4"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                <Tooltip content={<VitalTooltip unit={activeConfig?.unit ?? ""} />} />
                <Area type="monotone" dataKey="value" stroke={activeConfig?.color ?? "#06b6d4"}
                  strokeWidth={2} fill="url(#vitalGrad)" dot={{ fill: activeConfig?.color ?? "#06b6d4", r: 3 }} />
                {/* Reference range */}
                {activeConfig?.range && (
                  <>
                    <ReferenceLine y={activeConfig.range[0]} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                    <ReferenceLine y={activeConfig.range[1]} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Significance indicator */}
          {activeData.significance && (
            <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] text-amber-300">
                ⚠ {activeData.significance}. This may warrant discussion with your healthcare provider.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="h-40 flex items-center justify-center">
          <p className="text-xs text-muted-foreground/40">Not enough data points for this metric.</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {trends.filter((t) => t.values.length > 0).slice(0, 6).map((t) => {
          const cfg = METRICS.find((m) => m.key === t.metric);
          return (
            <div key={t.metric} className="p-2 rounded-lg bg-white/5 border border-white/5">
              <p className="text-[10px] text-muted-foreground/60">{t.label}</p>
              <p className="text-sm font-bold text-foreground">{t.average ?? "—"}</p>
              <div className="flex items-center gap-1">
                {t.trend === "increasing" && <TrendingUp className="w-2.5 h-2.5 text-rose-400" />}
                {t.trend === "decreasing" && <TrendingDown className="w-2.5 h-2.5 text-emerald-400" />}
                {t.trend === "stable" && <Minus className="w-2.5 h-2.5 text-muted-foreground/50" />}
                {t.trend !== "insufficient_data" && t.changePercent != null && (
                  <span className="text-[9px] text-muted-foreground/40">{t.changePercent > 0 ? "+" : ""}{t.changePercent}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/30 text-center">
        Vital trends based on recorded measurements. Dashed lines show typical reference ranges.
      </p>
    </motion.div>
  );
}

function VitalTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-xs">
      <p className="text-muted-foreground font-medium mb-0.5">{label}</p>
      <p className="text-foreground font-bold">{payload[0]?.value} <span className="text-muted-foreground font-normal">{unit}</span></p>
    </div>
  );
}
