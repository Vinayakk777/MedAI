import { useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from "recharts";
import { TrendingUp } from "lucide-react";

const weekData = [
  { day: "Mon", heartRate: 68, systolic: 118, sleep: 7.2, steps: 6200 },
  { day: "Tue", heartRate: 72, systolic: 122, sleep: 6.8, steps: 8400 },
  { day: "Wed", heartRate: 75, systolic: 115, sleep: 7.5, steps: 7100 },
  { day: "Thu", heartRate: 70, systolic: 120, sleep: 8.1, steps: 9200 },
  { day: "Fri", heartRate: 73, systolic: 117, sleep: 6.5, steps: 5800 },
  { day: "Sat", heartRate: 71, systolic: 121, sleep: 7.8, steps: 10300 },
  { day: "Sun", heartRate: 74, systolic: 116, sleep: 7.3, steps: 7600 },
];

const TABS = ["Heart Rate", "Blood Pressure", "Sleep", "Activity"] as const;
type Tab = typeof TABS[number];

const tabConfig: Record<Tab, { key: string; color: string; unit: string; gradId: string }> = {
  "Heart Rate":     { key: "heartRate",  color: "#f43f5e", unit: "bpm",   gradId: "hr"   },
  "Blood Pressure": { key: "systolic",   color: "#06b6d4", unit: "mmHg",  gradId: "bp"   },
  "Sleep":          { key: "sleep",      color: "#8b5cf6", unit: "hrs",   gradId: "slp"  },
  "Activity":       { key: "steps",      color: "#10b981", unit: "steps", gradId: "act"  },
};

const CustomTooltip = ({ active, payload, label, unit }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 border border-white/10 rounded-xl px-3 py-2.5 shadow-xl text-xs">
      <p className="text-muted-foreground font-medium mb-1">{label}</p>
      <p className="text-foreground font-bold">{payload[0]?.value} <span className="text-muted-foreground font-normal">{unit}</span></p>
    </div>
  );
};

export function HealthTrendsChart() {
  const [activeTab, setActiveTab] = useState<Tab>("Heart Rate");
  const cfg = tabConfig[activeTab];
  const isBar = activeTab === "Activity";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Health Trends</h3>
          </div>
          <p className="text-xs text-muted-foreground">7-day overview</p>
        </div>
        <div className="flex items-center gap-1 bg-background/60 rounded-xl p-1 border border-white/5">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`trend-tab-${tab.replace(/\s/g, "-").toLowerCase()}`}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        {isBar ? (
          <BarChart data={weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={(p) => <CustomTooltip {...p} unit={cfg.unit} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey={cfg.key} fill={cfg.color} radius={[4, 4, 0, 0]} opacity={0.85} />
          </BarChart>
        ) : (
          <AreaChart data={weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={cfg.gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={(p) => <CustomTooltip {...p} unit={cfg.unit} />} />
            <Area
              type="monotone"
              dataKey={cfg.key}
              stroke={cfg.color}
              strokeWidth={2}
              fill={`url(#${cfg.gradId})`}
              dot={{ fill: cfg.color, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, fill: cfg.color, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </motion.div>
  );
}
