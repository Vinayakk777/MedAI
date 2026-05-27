import { motion } from "framer-motion";
import { Heart, Wind, Thermometer, Scale, Droplets, Activity } from "lucide-react";

const vitals = [
  {
    icon: Heart,
    label: "Heart Rate",
    value: "74",
    unit: "bpm",
    range: "60–100",
    percent: 54,
    color: "#f43f5e",
    status: "Normal",
    statusColor: "text-emerald-400",
  },
  {
    icon: Activity,
    label: "Blood Pressure",
    value: "116/76",
    unit: "mmHg",
    range: "<120/80",
    percent: 72,
    color: "#06b6d4",
    status: "Normal",
    statusColor: "text-emerald-400",
  },
  {
    icon: Thermometer,
    label: "Temperature",
    value: "98.4",
    unit: "°F",
    range: "97.8–99.1",
    percent: 48,
    color: "#f59e0b",
    status: "Normal",
    statusColor: "text-emerald-400",
  },
  {
    icon: Wind,
    label: "Respiratory",
    value: "15",
    unit: "br/min",
    range: "12–20",
    percent: 44,
    color: "#8b5cf6",
    status: "Normal",
    statusColor: "text-emerald-400",
  },
  {
    icon: Droplets,
    label: "Oxygen Sat",
    value: "98",
    unit: "%",
    range: "95–100",
    percent: 92,
    color: "#10b981",
    status: "Excellent",
    statusColor: "text-emerald-400",
  },
  {
    icon: Scale,
    label: "BMI",
    value: "24.3",
    unit: "",
    range: "18.5–24.9",
    percent: 82,
    color: "#6366f1",
    status: "Healthy",
    statusColor: "text-emerald-400",
  },
];

export function VitalsPanel() {
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
      <p className="text-xs text-muted-foreground mb-5">Last updated today</p>

      <div className="space-y-4">
        {vitals.map((v, i) => {
          const Icon = v.icon;
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
                    <span className={`text-[10px] font-semibold ${v.statusColor}`}>{v.status}</span>
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {v.value}
                      {v.unit && <span className="text-[10px] text-muted-foreground font-normal ml-0.5">{v.unit}</span>}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pl-10">
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${v.percent}%` }}
                    transition={{ duration: 0.8, delay: 0.3 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
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
    </motion.div>
  );
}
