import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import {
  Thermometer, TrendingUp, TrendingDown, Minus, AlertTriangle,
  ChevronDown, ChevronUp,
} from "lucide-react";

type TrendEntry = {
  metric: string;
  label: string;
  values: { date: string; value: number }[];
  average: number | null;
  min: number | null;
  max: number | null;
  trend: "improving" | "worsening" | "stable" | "insufficient_data";
  changePercent: number | null;
};

export function SymptomTrendsChart() {
  const [expandedSymptom, setExpandedSymptom] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<TrendEntry[]>({
    queryKey: ["wellness-symptom-trends"],
    queryFn: () => fetch("/api/wellness/symptom-trends").then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-36 bg-white/5 rounded" />
          <div className="h-32 bg-white/5 rounded" />
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
          <h3 className="text-sm font-semibold text-foreground">Symptom Trends</h3>
        </div>
        <p className="text-xs text-muted-foreground">Failed to load symptom trends.</p>
      </motion.div>
    );
  }

  const trends = (data ?? []).slice(0, 8);

  if (trends.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Thermometer className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Symptom Trends</h3>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">Not enough symptom data yet to identify trends.</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Thermometer className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Symptom & Health Trends</h3>
      </div>

      {/* Trend summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {trends.slice(0, 6).map((t) => (
          <button key={t.metric} onClick={() => setExpandedSymptom(expandedSymptom === t.metric ? null : t.metric)}
            className={`p-2.5 rounded-xl border text-left transition-all ${
              expandedSymptom === t.metric ? "bg-primary/10 border-primary/20" : "bg-white/5 border-white/5 hover:bg-white/10"
            }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground truncate">{t.label}</span>
              {t.trend === "improving" && <TrendingDown className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
              {t.trend === "worsening" && <TrendingUp className="w-3 h-3 text-rose-400 flex-shrink-0" />}
              {t.trend === "stable" && <Minus className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-lg font-bold text-foreground">{t.values.length}</span>
              <span className="text-[10px] text-muted-foreground/50">reports</span>
            </div>
            {t.average != null && (
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">Avg severity: {t.average.toFixed(1)}</p>
            )}
          </button>
        ))}
      </div>

      {/* Expanded chart */}
      {expandedSymptom && (() => {
        const trend = trends.find((t) => t.metric === expandedSymptom);
        if (!trend || trend.values.length < 2) return null;
        const chartData = trend.values.map((v) => ({
          date: new Date(v.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          value: v.value,
        }));
        return (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden mb-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-foreground">{trend.label}</h4>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded ${
                    trend.trend === "improving" ? "bg-emerald-500/10 text-emerald-400" :
                    trend.trend === "worsening" ? "bg-rose-500/10 text-rose-400" :
                    "bg-white/5 text-muted-foreground"
                  }`}>{trend.trend}</span>
                  {trend.changePercent != null && (
                    <span className="text-muted-foreground/50">{trend.changePercent > 0 ? "+" : ""}{trend.changePercent}%</span>
                  )}
                </div>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="symGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} domain={[0, 5]} />
                    <Tooltip content={<SeverityTooltip />} />
                    <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2}
                      fill="url(#symGrad)" dot={{ fill: "#06b6d4", r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* Summary */}
      {trends.length > 0 && (
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mb-1">Summary</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {trends.filter((t) => t.trend === "worsening").length > 0
              ? `${trends.filter((t) => t.trend === "worsening").length} symptom(s) showing increasing patterns. `
              : "No worsening trends detected. "}
            {trends.filter((t) => t.trend === "improving").length > 0
              ? `${trends.filter((t) => t.trend === "improving").length} symptom(s) are improving. `
              : ""}
            Click on any symptom above to see its detailed trend chart.
          </p>
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground/30 text-center">
        Trend analysis is based on self-reported symptom severity over time.
      </p>
    </motion.div>
  );
}

function SeverityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const labels = ["None", "Minimal", "Mild", "Moderate", "Severe", "Critical"];
  return (
    <div className="bg-card/95 border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-xs">
      <p className="text-muted-foreground font-medium mb-0.5">{label}</p>
      <p className="text-cyan-400 font-bold">{labels[payload[0]?.value] ?? payload[0]?.value}</p>
    </div>
  );
}
