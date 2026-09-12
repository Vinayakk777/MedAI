import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Heart, Activity, Thermometer, Droplets, FlaskConical, Scale, Wind, Clock } from "lucide-react";

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

export function ManualVitalsForm({ onDone }: Props) {
  const [form, setForm] = useState<VitalsForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const queryClient = useQueryClient();

  const set = (key: keyof VitalsForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { source: "manual" };
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

      const hasAny = Object.keys(body).some((k) => k !== "source" && body[k] != null);
      if (!hasAny) throw new Error("Enter at least one vital sign.");

      const res = await fetch("/api/dashboard/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to save vitals");
      }
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["dashboard", "vitals"] });
      setTimeout(() => {
        setForm(initial);
        setSuccess(false);
        onDone?.();
      }, 1500);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed"),
  });

  const hasAny = Object.values(form).some((v) => v.trim() !== "");

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      className="rounded-2xl border border-white/10 bg-card/90 backdrop-blur-sm p-5">
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
        Enter any vitals you have measured. Only fill in what you know — leave the rest blank.
      </p>

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
                  className="w-full bg-background/50 border border-white/8 rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-colors tabular-nums"
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
          onClick={() => submit.mutate()}
          disabled={!hasAny || submit.isPending || success}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submit.isPending ? (
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : success ? (
            <span className="text-emerald-200">Saved</span>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              Save Vitals
            </>
          )}
        </button>
        {error && <span className="text-[11px] text-rose-400">{error}</span>}
      </div>
    </motion.div>
  );
}
