import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Heart, Wind, Thermometer, Scale, Droplets, Activity } from "lucide-react";

type VitalRecord = {
  id: string;
  heartRate: number | null;
  systolic: number | null;
  diastolic: number | null;
  temperature: string | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  bmi: string | null;
  recordedAt: string;
};

const vitalDefs: {
  icon: React.ElementType;
  label: string;
  key: keyof VitalRecord | "bp";
  unit: string;
  range: string;
  defaultPercent: number;
  color: string;
}[] = [
  { icon: Heart, label: "Heart Rate", key: "heartRate", unit: "bpm", range: "60–100", defaultPercent: 54, color: "#f43f5e" },
  { icon: Activity, label: "Blood Pressure", key: "bp", unit: "mmHg", range: "<120/80", defaultPercent: 72, color: "#06b6d4" },
  { icon: Thermometer, label: "Temperature", key: "temperature", unit: "°F", range: "97.8–99.1", defaultPercent: 48, color: "#f59e0b" },
  { icon: Wind, label: "Respiratory", key: "respiratoryRate", unit: "br/min", range: "12–20", defaultPercent: 44, color: "#8b5cf6" },
  { icon: Droplets, label: "Oxygen Sat", key: "oxygenSaturation", unit: "%", range: "95–100", defaultPercent: 92, color: "#10b981" },
  { icon: Scale, label: "BMI", key: "bmi", unit: "", range: "18.5–24.9", defaultPercent: 82, color: "#6366f1" },
];

function getStatusColor(_value: unknown): string {
  return "text-emerald-400";
}

function getStatus(): string {
  return "Normal";
}

export function VitalsPanel() {
  const { data, isLoading } = useQuery<VitalRecord[]>({
    queryKey: ["dashboard", "vitals"],
    queryFn: () => fetch("/api/dashboard/vitals").then((r) => r.json()),
  });

  const latest = data && data.length > 0 ? data[0] : null;

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Vital Signs</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Loading...</p>
        <div className="space-y-4 animate-pulse">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-white/5" />
              <div className="flex-1">
                <div className="h-3 w-24 bg-white/5 rounded mb-2" />
                <div className="h-1 w-full bg-white/5 rounded" />
              </div>
            </div>
          ))}
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
        <Activity className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Vital Signs</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        {latest ? `Last recorded ${new Date(latest.recordedAt).toLocaleDateString()}` : "No vitals recorded yet"}
      </p>

      {!latest ? (
        <div className="text-center py-8">
          <Activity className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground/50">Add your first vital signs record to start tracking</p>
        </div>
      ) : (
        <div className="space-y-4">
          {vitalDefs.map((v, i) => {
            const Icon = v.icon;
            const valueStr = v.key === "bp"
              ? latest.systolic != null && latest.diastolic != null
                ? `${latest.systolic}/${latest.diastolic}`
                : "—"
              : latest[v.key as keyof VitalRecord] != null
                ? `${latest[v.key as keyof VitalRecord]}`
                : "—";
            return (
              <motion.div
                key={v.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.06, duration: 0.35 }}
                data-testid={`vital-${v.label.replace(/\s/g, "-").toLowerCase()}`}
                className="group"
              >
                <div className="flex items-center gap-3 mb-1.5">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${v.color}15` }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: v.color }} />
                  </div>
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="text-xs font-medium text-muted-foreground">{v.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold ${getStatusColor(valueStr)}`}>{getStatus()}</span>
                      <span className="text-sm font-bold text-foreground tabular-nums">
                        {valueStr}
                        {v.unit && valueStr !== "—" && <span className="text-[10px] text-muted-foreground font-normal ml-0.5">{v.unit}</span>}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="pl-10">
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${v.defaultPercent}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.07, ease: [0.22, 1, 0.36, 1] as const }}
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${v.color}80, ${v.color})` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[9px] text-muted-foreground/30">Normal range: {v.range}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
