import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stethoscope, X, AlertCircle, CheckCircle, Loader2, ChevronRight } from "lucide-react";

const SYMPTOM_CATEGORIES = [
  {
    label: "Head & Neurological",
    color: "text-violet-400",
    bg: "bg-violet-500/8",
    border: "border-violet-500/20",
    symptoms: ["Headache", "Dizziness", "Migraine", "Brain fog", "Blurred vision"],
  },
  {
    label: "Chest & Cardiac",
    color: "text-rose-400",
    bg: "bg-rose-500/8",
    border: "border-rose-500/20",
    symptoms: ["Chest pain", "Palpitations", "Shortness of breath", "Tightness"],
  },
  {
    label: "Digestive",
    color: "text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/20",
    symptoms: ["Nausea", "Stomach pain", "Bloating", "Diarrhea", "Heartburn"],
  },
  {
    label: "General",
    color: "text-cyan-400",
    bg: "bg-cyan-500/8",
    border: "border-cyan-500/20",
    symptoms: ["Fever", "Fatigue", "Chills", "Loss of appetite", "Joint pain"],
  },
];

type AssessmentLevel = "low" | "moderate" | "high";

interface Assessment {
  level: AssessmentLevel;
  title: string;
  description: string;
  action: string;
}

function generateAssessment(symptoms: string[]): Assessment {
  const high = ["Chest pain", "Shortness of breath", "Tightness", "Palpitations"];
  const hasHigh = symptoms.some((s) => high.includes(s));
  if (hasHigh) return {
    level: "high",
    title: "Seek Medical Attention",
    description: "Some of your selected symptoms may require prompt evaluation by a healthcare provider.",
    action: "Schedule urgent appointment or visit urgent care today",
  };
  if (symptoms.length >= 3) return {
    level: "moderate",
    title: "Monitor & Consider Care",
    description: "Multiple symptoms together may indicate a condition worth discussing with your doctor.",
    action: "Schedule a routine appointment within 1–3 days",
  };
  return {
    level: "low",
    title: "Monitor at Home",
    description: "Your selected symptoms are generally mild. Rest, hydration, and OTC remedies may help.",
    action: "Monitor for 48 hours. Seek care if symptoms worsen.",
  };
}

const levelStyles: Record<AssessmentLevel, { bg: string; border: string; icon: string; color: string }> = {
  low:      { bg: "bg-emerald-500/8",  border: "border-emerald-500/20", icon: "text-emerald-400", color: "text-emerald-400" },
  moderate: { bg: "bg-amber-500/8",    border: "border-amber-500/20",   icon: "text-amber-400",   color: "text-amber-400"   },
  high:     { bg: "bg-rose-500/8",     border: "border-rose-500/20",    icon: "text-rose-400",    color: "text-rose-400"    },
};

export function SymptomCheckerWidget() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  const saveMutation = useMutation({
    mutationFn: (data: { symptoms: string[]; assessmentLevel: string; assessmentTitle: string; assessmentDescription: string; assessmentAction: string }) =>
      fetch("/api/dashboard/symptom-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    },
  });

  const toggle = (s: string) => {
    setAssessment(null);
    setSelected((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const runCheck = () => {
    if (!selected.length) return;
    setAssessment(null);
    const result = generateAssessment(selected);
    saveMutation.mutate({
      symptoms: selected,
      assessmentLevel: result.level,
      assessmentTitle: result.title,
      assessmentDescription: result.description,
      assessmentAction: result.action,
    });
    setAssessment(result);
  };

  const reset = () => { setSelected([]); setAssessment(null); };

  const levelStyle = assessment ? levelStyles[assessment.level] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
      id="symptom-checker"
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Symptom Checker</h3>
        </div>
        {selected.length > 0 && (
          <button onClick={reset} className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1">
            <X className="w-3 h-3" /> Clear all
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-5">Select all symptoms you are currently experiencing</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        {SYMPTOM_CATEGORIES.map((cat) => (
          <div key={cat.label} className={`rounded-xl border ${cat.border} ${cat.bg} p-4`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${cat.color}`}>{cat.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {cat.symptoms.map((s) => {
                const active = selected.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggle(s)}
                    data-testid={`symptom-${s.replace(/\s/g, "-").toLowerCase()}`}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-150 border ${
                      active
                        ? `${cat.bg} ${cat.border} ${cat.color} border-opacity-60`
                        : "border-white/5 text-muted-foreground/60 hover:text-muted-foreground hover:border-white/10"
                    }`}
                  >
                    {active && <span className="mr-1">✓</span>}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 flex-1">
            {selected.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary text-[11px] rounded-lg font-medium">
                {s}
                <button onClick={() => toggle(s)} className="hover:text-primary/60">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <button
          onClick={runCheck}
          disabled={selected.length === 0 || saveMutation.isPending}
          data-testid="button-check-symptoms"
          className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stethoscope className="w-4 h-4" />}
          Analyze
        </button>
      </div>

      <AnimatePresence>
        {assessment && levelStyle && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className={`rounded-xl border ${levelStyle.border} ${levelStyle.bg} p-4`}
          >
            <div className="flex items-start gap-3">
              {assessment.level === "low"
                ? <CheckCircle className={`w-5 h-5 ${levelStyle.icon} flex-shrink-0 mt-0.5`} />
                : <AlertCircle className={`w-5 h-5 ${levelStyle.icon} flex-shrink-0 mt-0.5`} />
              }
              <div>
                <p className={`text-sm font-semibold mb-1 ${levelStyle.color}`}>{assessment.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{assessment.description}</p>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${levelStyle.color}`}>
                  <ChevronRight className="w-3.5 h-3.5" />
                  {assessment.action}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
