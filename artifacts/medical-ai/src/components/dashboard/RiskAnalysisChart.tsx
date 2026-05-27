import { motion } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip
} from "recharts";
import { ShieldAlert } from "lucide-react";

const riskData = [
  { category: "Cardio", risk: 35, baseline: 50 },
  { category: "Respiratory", risk: 22, baseline: 50 },
  { category: "Metabolic", risk: 48, baseline: 50 },
  { category: "Neurological", risk: 18, baseline: 50 },
  { category: "Immune", risk: 30, baseline: 50 },
  { category: "Musculo", risk: 42, baseline: 50 },
];

const riskFactors = [
  { label: "Cardiovascular", score: 35, color: "#06b6d4", level: "Low" },
  { label: "Metabolic", score: 48, color: "#f59e0b", level: "Moderate" },
  { label: "Musculoskeletal", score: 42, color: "#8b5cf6", level: "Moderate" },
  { label: "Respiratory", score: 22, color: "#10b981", level: "Low" },
];

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
          transition={{ duration: 0.8, delay: 0.4 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
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
        <span className="text-emerald-400 font-semibold">Below Average Overall</span>
      </div>
    </motion.div>
  );
}
