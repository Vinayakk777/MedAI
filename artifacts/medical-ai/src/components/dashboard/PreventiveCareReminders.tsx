import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,   CheckCircle, XCircle, AlertTriangle,
  Calendar, Syringe, Stethoscope, Eye, Activity,
} from "lucide-react";

type Reminder = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  frequency: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  completedAt: string | null;
};

const categoryIcons: Record<string, { icon: typeof ShieldCheck; color: string }> = {
  checkup:     { icon: Stethoscope, color: "text-blue-400" },
  screening:   { icon: ShieldCheck, color: "text-cyan-400" },
  vaccination: { icon: Syringe,     color: "text-emerald-400" },
  dental:      { icon: Activity,    color: "text-violet-400" },
  eye:         { icon: Eye,         color: "text-amber-400" },
  lifestyle:   { icon: ShieldCheck, color: "text-rose-400" },
};

export function PreventiveCareReminders() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<Reminder[]>({
    queryKey: ["wellness-reminders"],
    queryFn: () => fetch("/api/wellness/reminders").then((r) => r.json()),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/wellness/reminders/${id}/complete`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wellness-reminders"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/wellness/reminders/${id}/dismiss`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wellness-reminders"] }),
  });

  const initMutation = useMutation({
    mutationFn: () => fetch("/api/wellness/reminders/init-defaults", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wellness-reminders"] }),
  });

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-36 bg-white/5 rounded" />
          <div className="h-12 bg-white/5 rounded" />
          <div className="h-12 bg-white/5 rounded" />
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
          <h3 className="text-sm font-semibold text-foreground">Preventive Care</h3>
        </div>
        <p className="text-xs text-muted-foreground">Failed to load reminders.</p>
      </motion.div>
    );
  }

  const reminders = data ?? [];
  const pending = reminders.filter((r) => !r.isCompleted);
  const completed = reminders.filter((r) => r.isCompleted);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Preventive Care</h3>
          <span className="text-[10px] text-muted-foreground/40 bg-white/5 px-1.5 py-0.5 rounded-md">{pending.length}</span>
        </div>
        {reminders.length === 0 && (
          <button onClick={() => initMutation.mutate()}
            className="px-2.5 py-1.5 text-[10px] rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/5 border border-white/10 transition-all">
            Initialize
          </button>
        )}
      </div>

      {reminders.length === 0 ? (
        <div className="text-center py-6">
          <ShieldCheck className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/60">No preventive care reminders yet. Click "Initialize" to set up default recommendations.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {pending.map((r) => {
            const cfg = categoryIcons[r.category] ?? { icon: ShieldCheck, color: "text-cyan-400" };
            const Icon = cfg.icon;
            return (
              <div key={r.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/5">
                <Icon className={`w-3.5 h-3.5 ${cfg.color} mt-0.5 flex-shrink-0`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">{r.title}</span>
                    {r.frequency && <span className="text-[9px] text-muted-foreground/40 bg-white/5 px-1 py-0.5 rounded">{r.frequency}</span>}
                  </div>
                  {r.description && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{r.description}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => completeMutation.mutate(r.id)}
                    className="p-1 rounded text-muted-foreground/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                    aria-label="Mark complete">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => dismissMutation.mutate(r.id)}
                    className="p-1 rounded text-muted-foreground/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    aria-label="Dismiss">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {completed.length > 0 && (
            <details className="mt-2">
              <summary className="text-[10px] text-muted-foreground/40 cursor-pointer hover:text-foreground transition-colors">
                {completed.length} completed
              </summary>
              <div className="mt-1 space-y-1">
                {completed.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 opacity-60">
                    <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    <span className="text-[10px] text-muted-foreground line-through">{r.title}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground/30 text-center">
        Preventive care reminders are generalized suggestions. Consult your physician for personalized recommendations.
      </p>
    </motion.div>
  );
}
