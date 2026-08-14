import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip
} from "recharts";
import { ShieldAlert } from "lucide-react";

type RiskRecord = {
  id: string;
  category: string;
  score: number;
  baseline: number | null;
  level: string;
};

const categoryColors: Record<string, string> = {
  Cardio: "#06b6d4",
  Respiratory: "#10b981",
  Metabolic: "#f59e0b",
  Neurological: "#8b5cf6",
  Immune: "#f43f5e",
  Musculo: "#6366f1",
};

const categoryShort: Record<string, string> = {
  Cardio: "Cardiovascular",
  Respiratory: "Respiratory",
  Metabolic: "Metabolic",
  Neurological: "Neurological",
  Immune: "Immune",
  Musculo: "Musculoskeletal",
};

function RiskBar({ label, score, color, level, index }: { label: string; score: number; color: string; level: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.08, duration: 0.4 }}
    >
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-semibold" style={{ color }}>{level}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, delay: 0.4 + index * 0.1, ease: [0.22, 1, 0.36, 1] as const }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-card/95 border border-white/10 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-foreground font-semibold">{d?.category}</p>
      <p className="text-cyan-400">Risk: {d?.risk}/100</p>
    </div>
  );
};

export function RiskAnalysisChart() {
  const { data, isLoading } = useQuery<RiskRecord[]>({
    queryKey: ["dashboard", "risk-assessments"],
    queryFn: () => fetch("/api/dashboard/risk-assessments").then((r) => r.json()),
  });

  const records = data ?? [];

  const riskData = records.map((r) => ({
    category: r.category.length > 5 ? r.category.slice(0, 5) : r.category,
    risk: r.score,
    baseline: r.baseline ?? 50,
  }));

  const riskFactors = records.map((r) => ({
    label: categoryShort[r.category] ?? r.category,
    score: r.score,
    color: categoryColors[r.category] ?? "#06b6d4",
    level: r.level.charAt(0).toUpperCase() + r.level.slice(1),
  }));

  const avgScore = records.length > 0
    ? Math.round(records.reduce((s, r) => s + r.score, 0) / records.length)
    : null;

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
      >
        <div className="animate-pulse h-[300px] flex items-center justify-center">
          <p className="text-xs text-muted-foreground/40">Loading risk data...</p>
        </div>
      </motion.div>
    );
  }

  if (records.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-foreground">Risk Analysis</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">No risk assessments yet</p>
        <div className="text-center py-8">
          <ShieldAlert className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground/50">Complete a symptom check to see risk analysis</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-foreground">Risk Analysis</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Body system risk scores</p>

      <ResponsiveContainer width="100%" height={180}>
        <RadarChart data={riskData} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 500 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Radar
            name="Risk"
            dataKey="risk"
            stroke="#06b6d4"
            fill="#06b6d4"
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={{ fill: "#06b6d4", r: 3, strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>

      <div className="mt-4 space-y-0.5">
        {riskFactors.map((f, i) => (
          <RiskBar key={f.label} {...f} index={i} />
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <span className="text-muted-foreground">Your risk profile</span>
        </div>
        <span className="text-emerald-400 font-semibold">
          {avgScore != null ? `${avgScore}% avg` : "No data"}
        </span>
      </div>
    </motion.div>
  );
}
