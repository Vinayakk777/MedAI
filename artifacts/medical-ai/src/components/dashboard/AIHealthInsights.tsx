import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain, Lightbulb, TrendingUp, TrendingDown, Activity,
  AlertTriangle, X, ChevronDown, ChevronUp, RefreshCw,
  HeartPulse, Thermometer, Pill,
} from "lucide-react";

type HealthInsight = {
  id: string;
  category: string;
  title: string;
  description: string;
  confidence: string;
  relevanceScore: number;
  isActionable: boolean;
  suggestedAction: string | null;
  relatedSymptoms: string[];
  relatedMetrics: string[];
  isDismissed: boolean;
  createdAt: string;
};

const categoryConfig: Record<string, { icon: typeof Brain; color: string }> = {
  symptom_trend: { icon: Thermometer, color: "text-cyan-400" },
  vital_trend:   { icon: HeartPulse,  color: "text-rose-400" },
  lifestyle:     { icon: Activity,    color: "text-emerald-400" },
  medication:    { icon: Pill,        color: "text-violet-400" },
  preventive:    { icon: Lightbulb,   color: "text-amber-400" },
  recovery:      { icon: TrendingUp,  color: "text-blue-400" },
};

const iconMap: Record<string, typeof Brain> = {
  symptom_trend: Thermometer,
  vital_trend: HeartPulse,
  lifestyle: Activity,
  medication: Pill,
  preventive: Lightbulb,
  recovery: TrendingUp,
};

export function AIHealthInsights() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<HealthInsight[]>({
    queryKey: ["wellness-insights"],
    queryFn: () => fetch("/api/wellness/insights").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/wellness/insights/${id}/dismiss`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wellness-insights"] }),
  });

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-28 bg-white/5 rounded" />
          <div className="h-20 bg-white/5 rounded" />
          <div className="h-20 bg-white/5 rounded" />
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
          <h3 className="text-sm font-semibold text-foreground">AI Health Insights</h3>
        </div>
        <p className="text-xs text-muted-foreground">Failed to generate insights. Please try again later.</p>
      </motion.div>
    );
  }

  const insights = (data ?? []).filter((i) => !i.isDismissed);

  if (insights.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">AI Health Insights</h3>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">
          No insights yet. Insights are generated as you build your consultation history.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">AI Health Insights</h3>
          <span className="text-[10px] text-muted-foreground/40 bg-white/5 px-1.5 py-0.5 rounded-md">{insights.length}</span>
        </div>
        <button onClick={() => queryClient.invalidateQueries({ queryKey: ["wellness-insights"] })}
          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-white/5 transition-all">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        {insights.map((insight) => {
          const cfg = categoryConfig[insight.category] ?? { icon: Brain, color: "text-cyan-400" };
          const Icon = iconMap[insight.category] ?? Brain;
          const isExpanded = expandedId === insight.id;

          return (
            <motion.div key={insight.id} layout
              className={`rounded-xl border border-white/5 transition-all ${insight.isActionable ? "bg-white/[0.04]" : "bg-white/[0.02]"}`}>
              <button onClick={() => setExpandedId(isExpanded ? null : insight.id)}
                className="w-full text-left p-3 flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <Icon className={`w-4 h-4 ${cfg.color} mt-0.5 flex-shrink-0`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{insight.title}</span>
                      <ConfidenceBadge level={insight.confidence} />
                      {insight.isActionable && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Actionable</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {new Date(insight.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {insight.relatedSymptoms.length > 0 && ` · ${insight.relatedSymptoms.slice(0, 2).join(", ")}${insight.relatedSymptoms.length > 2 ? "..." : ""}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); dismissMutation.mutate(insight.id); }}
                    className="p-1 rounded text-muted-foreground/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                    <X className="w-3 h-3" />
                  </button>
                  {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/50" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50" />}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-white/5">
                    <div className="p-3 space-y-2">
                      <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
                      {insight.suggestedAction && (
                        <div className="p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15">
                          <p className="text-[10px] text-cyan-400/80 uppercase tracking-wider mb-0.5">Suggested Action</p>
                          <p className="text-xs text-cyan-300/80">{insight.suggestedAction}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                        <span>Relevance: {insight.relevanceScore}%</span>
                        <span>·</span>
                        <span>Category: {insight.category.replace("_", " ")}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/30 text-center">
        AI-generated observations based on your health data. Not medical advice — consult a physician.
      </p>
    </motion.div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const cfg = {
    high: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
    moderate: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
    low: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
  };
  const c = cfg[level as keyof typeof cfg] ?? cfg.moderate;
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded border font-medium ${c.bg} ${c.text} ${c.border}`}>
      {level}
    </span>
  );
}
