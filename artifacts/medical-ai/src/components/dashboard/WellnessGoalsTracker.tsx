import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target, Plus, CheckCircle, Flame, Clock, X,
  Trophy, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";

type WellnessGoal = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  targetValue: number | null;
  targetUnit: string | null;
  currentValue: number;
  frequency: string;
  streak: number;
  bestStreak: number;
  totalCompletions: number;
  status: string;
};

type GoalLog = {
  id: string;
  goalId: string;
  value: number | null;
  note: string | null;
  loggedAt: string;
};

const categoryIcons: Record<string, string> = {
  sleep: "🌙", activity: "🏃", hydration: "💧", nutrition: "🥗",
  weight: "⚖️", bp: "❤️", glucose: "🩸", stress: "🧘", custom: "🎯",
};

export function WellnessGoalsTracker() {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("custom");
  const [newTarget, setNewTarget] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [loggingGoal, setLoggingGoal] = useState<string | null>(null);
  const [logValue, setLogValue] = useState("");
  const [logNote, setLogNote] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<WellnessGoal[]>({
    queryKey: ["wellness-goals"],
    queryFn: () => fetch("/api/wellness/goals").then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => fetch("/api/wellness/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["wellness-goals"] }); setShowCreate(false); setNewTitle(""); setNewTarget(""); setNewUnit(""); },
  });

  const logMutation = useMutation({
    mutationFn: ({ goalId, value, note }: { goalId: string; value?: number; note?: string }) =>
      fetch(`/api/wellness/goals/${goalId}/log`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value, note }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["wellness-goals"] }); setLoggingGoal(null); setLogValue(""); setLogNote(""); },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/wellness/goals/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wellness-goals"] }),
  });

  const goals = data ?? [];

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-white/5 rounded" />
          <div className="h-16 bg-white/5 rounded" />
          <div className="h-16 bg-white/5 rounded" />
        </div>
      </motion.div>
    );
  }

  if (error) {
    return <ErrorWidget />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Wellness Goals</h3>
          <span className="text-[10px] text-muted-foreground/40 bg-white/5 px-1.5 py-0.5 rounded-md">{goals.length}</span>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/5 border border-white/10 transition-all">
          <Plus className="w-3 h-3" /> Add Goal
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-2">
              <input type="text" placeholder="Goal title..."
                value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40" />
              <div className="flex gap-2">
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-[10px] rounded-lg bg-background border border-white/10 text-foreground focus:outline-none">
                  <option value="sleep">Sleep</option><option value="activity">Activity</option>
                  <option value="hydration">Hydration</option><option value="nutrition">Nutrition</option>
                  <option value="weight">Weight</option><option value="stress">Stress</option>
                  <option value="custom">Custom</option>
                </select>
                <input type="number" placeholder="Target"
                  value={newTarget} onChange={(e) => setNewTarget(e.target.value)}
                  className="w-20 px-2 py-1.5 text-[10px] rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none" />
                <input type="text" placeholder="Unit"
                  value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
                  className="w-16 px-2 py-1.5 text-[10px] rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none" />
              </div>
              <button onClick={() => createMutation.mutate({ title: newTitle, category: newCategory, targetValue: newTarget ? Number(newTarget) : undefined, targetUnit: newUnit || undefined })}
                disabled={!newTitle.trim()}
                className="w-full py-1.5 text-[10px] rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all disabled:opacity-30">
                Create Goal
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {goals.length === 0 ? (
        <div className="text-center py-6">
          <Trophy className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/60">No wellness goals yet. Create your first goal to start tracking progress!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map((goal) => (
            <motion.div key={goal.id} layout
              className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span className="text-lg">{categoryIcons[goal.category] ?? "🎯"}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{goal.title}</span>
                      {goal.targetUnit && (
                        <span className="text-[10px] text-muted-foreground/50">
                          {goal.targetValue ?? "—"} {goal.targetUnit}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {goal.frequency} · {goal.totalCompletions} completions
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Progress ring */}
                  {goal.targetValue != null && goal.targetValue > 0 && (
                    <div className="relative w-9 h-9">
                      <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/5" />
                        <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeDasharray={100.53} strokeDashoffset={100.53 * (1 - Math.min(goal.currentValue / goal.targetValue, 1))}
                          strokeLinecap="round" className="text-cyan-400" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-foreground">
                        {Math.round(Math.min((goal.currentValue / goal.targetValue) * 100, 100))}%
                      </span>
                    </div>
                  )}

                  {goal.streak > 0 && (
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
                      <Flame className="w-2.5 h-2.5 text-orange-400" />
                      <span className="text-[9px] font-bold text-orange-400">{goal.streak}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Log section */}
              <div className="mt-2 pt-2 border-t border-white/5">
                <button onClick={() => setLoggingGoal(loggingGoal === goal.id ? null : goal.id)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors">
                  <Clock className="w-3 h-3" /> Log Progress {loggingGoal === goal.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <AnimatePresence>
                  {loggingGoal === goal.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-2">
                      <div className="flex gap-1.5">
                        <input type="number" placeholder="Value" value={logValue} onChange={(e) => setLogValue(e.target.value)}
                          className="w-20 px-2 py-1 text-[10px] rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none" />
                        <input type="text" placeholder="Note (optional)" value={logNote} onChange={(e) => setLogNote(e.target.value)}
                          className="flex-1 px-2 py-1 text-[10px] rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none" />
                        <button onClick={() => logMutation.mutate({ goalId: goal.id, value: logValue ? Number(logValue) : undefined, note: logNote || undefined })}
                          className="px-2 py-1 text-[10px] rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all">
                          Log
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground/30 text-center">
        Track your wellness journey one goal at a time.
      </p>
    </motion.div>
  );
}

function ErrorWidget() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-rose-500/15 bg-rose-500/5 backdrop-blur-sm p-6">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-rose-400" />
        <h3 className="text-sm font-semibold text-foreground">Wellness Goals</h3>
      </div>
      <p className="text-xs text-muted-foreground">Failed to load goals.</p>
    </motion.div>
  );
}
