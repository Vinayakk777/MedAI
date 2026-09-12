import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Heart, Activity, Thermometer, Droplets, FlaskConical, Scale, Wind, AlertTriangle, CheckCircle, ShieldAlert, ShieldCheck } from "lucide-react";

interface Props {
  onDone?: () => void;
}

interface VitalsForm {
  heartRate: string;
  systolic: string;
  diastolic: string;
  respiratoryRate: string;
  temperature: string;
  oxygenSaturation: string;
  bloodGlucose: string;
  weight: string;
  height: string;
  painScore: string;
  notes: string;
}

const initial: VitalsForm = {
  heartRate: "", systolic: "", diastolic: "", respiratoryRate: "", temperature: "",
  oxygenSaturation: "", bloodGlucose: "", weight: "", height: "", painScore: "", notes: "",
};

const fields: { key: keyof VitalsForm; label: string; icon: React.ElementType; placeholder: string; unit: string }[] = [
  { key: "heartRate", label: "Heart Rate", icon: Heart, placeholder: "e.g. 72", unit: "bpm" },
  { key: "systolic", label: "Systolic BP", icon: Activity, placeholder: "e.g. 120", unit: "mmHg" },
  { key: "diastolic", label: "Diastolic BP", icon: Activity, placeholder: "e.g. 80", unit: "mmHg" },
  { key: "respiratoryRate", label: "Resp. Rate", icon: Wind, placeholder: "e.g. 16", unit: "/min" },
  { key: "temperature", label: "Temperature", icon: Thermometer, placeholder: "e.g. 98.6", unit: "°F" },
  { key: "oxygenSaturation", label: "SpO₂", icon: Droplets, placeholder: "e.g. 98", unit: "%" },
  { key: "bloodGlucose", label: "Blood Glucose", icon: FlaskConical, placeholder: "e.g. 95", unit: "mg/dL" },
  { key: "weight", label: "Weight", icon: Scale, placeholder: "e.g. 154", unit: "lbs" },
  { key: "height", label: "Height", icon: Scale, placeholder: "e.g. 69", unit: "in" },
  { key: "painScore", label: "Pain (0-10)", icon: Activity, placeholder: "0 = none, 10 = worst", unit: "/10" },
];

function parseNum(v: string): number | undefined {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

const riskConfig: Record<string, { color: string; bg: string; border: string; icon: React.ElementType }> = {
  normal:   { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: ShieldCheck },
  caution:  { color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   icon: AlertTriangle },
  warning:  { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  icon: ShieldAlert },
  critical: { color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    icon: AlertTriangle },
};

const statusDot: Record<string, string> = {
  normal: "bg-emerald-400",
  caution: "bg-amber-400",
  warning: "bg-orange-400",
  critical: "bg-rose-400",
};

interface AnalysisResult {
  summary: string;
  riskLevel: "normal" | "caution" | "warning" | "critical";
  findings: { metric: string; value: string; status: "normal" | "caution" | "warning" | "critical"; explanation: string }[];
  recommendations: string[];
  seekMedicalAttention: boolean;
}

export function ManualVitalsForm({ onDone }: Props) {
  const [form, setForm] = useState<VitalsForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const queryClient = useQueryClient();

  const set = (key: keyof VitalsForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const analyze = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {};
      if (form.heartRate) body.heartRate = parseNum(form.heartRate);
      if (form.systolic) body.systolic = parseNum(form.systolic);
      if (form.diastolic) body.diastolic = parseNum(form.diastolic);
      if (form.respiratoryRate) body.respiratoryRate = parseNum(form.respiratoryRate);
      if (form.temperature) body.temperature = parseNum(form.temperature);
      if (form.oxygenSaturation) body.oxygenSaturation = parseNum(form.oxygenSaturation);
      if (form.bloodGlucose) body.bloodGlucose = parseNum(form.bloodGlucose);
      if (form.weight) body.weight = parseNum(form.weight);
      if (form.height) body.height = parseNum(form.height);
      if (form.painScore) body.painScore = parseNum(form.painScore);
      if (form.notes) body.notes = form.notes;

      const hasAny = Object.keys(body).length > 0;
      if (!hasAny) throw new Error("Enter at least one vital sign.");

      // Save vitals
      const saveRes = await fetch("/api/dashboard/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, source: "manual" }),
      });
      if (!saveRes.ok) throw new Error("Failed to save vitals");

      // Analyze
      const analyzeRes = await fetch("/api/dashboard/vitals/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!analyzeRes.ok) throw new Error("Analysis failed");
      return analyzeRes.json() as Promise<AnalysisResult>;
    },
    onSuccess: (data) => {
      setSuccess(true);
      setAnalysis(data);
      queryClient.invalidateQueries({ queryKey: ["dashboard", "vitals"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  const hasAny = Object.values(form).some((v) => v.trim() !== "");

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className="rounded-2xl border border-emerald-500/30 bg-card p-5 relative z-50 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-foreground">Log Vital Signs</h3>
        </div>
        {onDone && (
          <button onClick={onDone} className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground/40 hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground/50 mb-4">
        Enter any vitals you have measured. AI will analyze whether your readings are safe or need attention.
      </p>

      {!analysis ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fields.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.key} className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground/70">
                    <Icon className="w-3 h-3" />
                    {f.label}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={form[f.key]}
                      onChange={set(f.key)}
                      placeholder={f.placeholder}
                      className="w-full bg-white/5 border border-white/15 rounded-lg px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 transition-all tabular-nums cursor-text"
                      style={{ WebkitAppearance: "none" }}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/30 pointer-events-none">{f.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground/70">Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={set("notes")}
              placeholder="e.g. after exercise, fasting, etc."
              className="w-full bg-background/50 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-emerald-500/40 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => analyze.mutate()}
              disabled={!hasAny || analyze.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {analyze.isPending ? (
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Save & Analyze
                </>
              )}
            </button>
            {error && <span className="text-[11px] text-rose-400">{error}</span>}
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {/* Risk Level Banner */}
          {(() => {
            const cfg = riskConfig[analysis.riskLevel] ?? riskConfig.normal;
            const Icon = cfg.icon;
            return (
              <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                  <span className={`text-sm font-bold ${cfg.color} capitalize`}>{analysis.riskLevel} Risk</span>
                  {analysis.seekMedicalAttention && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> Seek Medical Attention
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground/80">{analysis.summary}</p>
              </div>
            );
          })()}

          {/* Individual Findings */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Detailed Findings</p>
            {analysis.findings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/3 px-3 py-2">
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${statusDot[f.status]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{f.metric}</span>
                    <span className="text-[10px] text-muted-foreground/60">{f.value}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{f.explanation}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Recommendations</p>
              {analysis.recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground/70">
                  <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[9px] text-muted-foreground/30 leading-relaxed">
            This is AI-generated analysis, not a medical diagnosis. Always consult a healthcare professional for medical decisions.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAnalysis(null); setForm(initial); setSuccess(false); setError(null); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Log More Vitals
            </button>
            {onDone && (
              <button
                onClick={() => { setAnalysis(null); setForm(initial); setSuccess(false); onDone(); }}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground/60 hover:text-foreground border border-white/8 hover:bg-white/5 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
