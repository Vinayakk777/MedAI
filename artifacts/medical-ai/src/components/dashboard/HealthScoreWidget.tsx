import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  HeartPulse, TrendingUp, TrendingDown, Activity,
  AlertTriangle, CheckCircle, ShieldAlert,
} from "lucide-react";

type OverviewData = {
  score: number;
  riskLevel: string;
  activeConcerns: number;
  stableConditions: number;
  recentImprovements: string[];
  focusAreas: string[];
};

export function HealthScoreWidget() {
  const { data, isLoading, error } = useQuery<OverviewData>({
    queryKey: ["wellness-overview"],
    queryFn: () => fetch("/api/wellness/overview").then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-white/5 rounded" />
          <div className="h-20 w-20 mx-auto bg-white/5 rounded-full" />
          <div className="h-3 w-24 mx-auto bg-white/5 rounded" />
        </div>
      </motion.div>
    );
  }

  if (error || !data) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-rose-500/15 bg-rose-500/5 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-foreground">Health Overview</h3>
        </div>
        <p className="text-xs text-muted-foreground">Unable to load health overview.</p>
      </motion.div>
    );
  }

  const scoreColor = data.score >= 70 ? "text-emerald-400" : data.score >= 40 ? "text-amber-400" : "text-rose-400";
  const scoreBg = data.score >= 70 ? "bg-emerald-500/10 border-emerald-500/20" : data.score >= 40 ? "bg-amber-500/10 border-amber-500/20" : "bg-rose-500/10 border-rose-500/20";
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (data.score / 100) * circumference;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">

      <div className="flex items-center gap-2 mb-4">
        <HeartPulse className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Health Overview</h3>
      </div>

      {/* Score gauge */}
      <div className="flex flex-col items-center mb-4">
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="6"
              className="text-white/5" />
            <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="6"
              strokeDasharray={circumference} strokeDashoffset={offset}
              strokeLinecap="round" className={scoreColor} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-bold ${scoreColor}`}>{data.score}</span>
          </div>
        </div>
        <div className={`mt-2 px-2.5 py-0.5 rounded-full border text-[10px] font-medium ${scoreBg}`}>
          {data.riskLevel === "elevated" ? "Elevated Risk" : data.riskLevel === "moderate" ? "Moderate Risk" : data.riskLevel === "low" ? "Low Risk" : "Not Assessed"}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 rounded-lg bg-white/5 border border-white/5">
          <Activity className="w-3.5 h-3.5 text-rose-400 mx-auto mb-0.5" />
          <p className="text-xs font-bold text-foreground">{data.activeConcerns}</p>
          <p className="text-[9px] text-muted-foreground/50 uppercase">Active</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5 border border-white/5">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-0.5" />
          <p className="text-xs font-bold text-foreground">{data.stableConditions}</p>
          <p className="text-[9px] text-muted-foreground/50 uppercase">Stable</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5 border border-white/5">
          <TrendingUp className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-0.5" />
          <p className="text-xs font-bold text-foreground">{data.recentImprovements.length}</p>
          <p className="text-[9px] text-muted-foreground/50 uppercase">Improved</p>
        </div>
      </div>

      {/* Improvements */}
      {data.recentImprovements.length > 0 && (
        <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
          <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-1">Recent Improvements</p>
          {data.recentImprovements.map((imp, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-emerald-300/80 mb-0.5">
              <TrendingUp className="w-3 h-3 text-emerald-400/60 mt-0.5 flex-shrink-0" />
              <span>{imp}</span>
            </div>
          ))}
        </div>
      )}

      {/* Focus areas */}
      {data.focusAreas.length > 0 && (
        <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <p className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1">Focus Areas</p>
          {data.focusAreas.map((fa, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-300/80 mb-0.5">
              <ShieldAlert className="w-3 h-3 text-amber-400/60 mt-0.5 flex-shrink-0" />
              <span>{fa}</span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground/30 text-center">
        AI-generated assessment based on your consultation history.
      </p>
    </motion.div>
  );
}
