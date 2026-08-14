import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Heart, ShieldAlert, Pill, CalendarCheck, TrendingUp, TrendingDown, Minus } from "lucide-react";

type OverviewData = {
  healthScore: number;
  activeAlerts: number;
  activeMedications: number;
  checkIns: number;
  reportCount: number;
};

const cardConfigs = [
  {
    key: "healthScore" as const,
    label: "Health Score",
    suffix: "/100",
    changeKey: null,
    changeLabel: "Latest from health reports",
    icon: Heart,
    color: "text-cyan-400",
    bg: "from-cyan-500/8 to-transparent",
    border: "rgba(6,182,212,0.2)",
    glow: "rgba(6,182,212,0.15)",
  },
  {
    key: "activeAlerts" as const,
    label: "Active Alerts",
    suffix: "",
    changeKey: null,
    changeLabel: "High-risk assessments",
    icon: ShieldAlert,
    color: "text-amber-400",
    bg: "from-amber-500/8 to-transparent",
    border: "rgba(245,158,11,0.2)",
    glow: "rgba(245,158,11,0.15)",
  },
  {
    key: "activeMedications" as const,
    label: "Medications",
    suffix: " active",
    changeKey: null,
    changeLabel: "Currently prescribed",
    icon: Pill,
    color: "text-violet-400",
    bg: "from-violet-500/8 to-transparent",
    border: "rgba(139,92,246,0.2)",
    glow: "rgba(139,92,246,0.15)",
  },
  {
    key: "checkIns" as const,
    label: "Check-ins",
    suffix: " total",
    changeKey: "reportCount" as const,
    changeLabel: "Health reports generated",
    icon: CalendarCheck,
    color: "text-emerald-400",
    bg: "from-emerald-500/8 to-transparent",
    border: "rgba(16,185,129,0.2)",
    glow: "rgba(16,185,129,0.15)",
  },
];

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  change: number;
  changeLabel: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  index: number;
}

function CountUp({ end, suffix = "", prefix = "", decimals = 0 }: { end: number; suffix?: string; prefix?: string; decimals?: number }) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true); }, { threshold: 0.3 });
    if (nodeRef.current) observer.observe(nodeRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started || !nodeRef.current) return;
    const node = nodeRef.current;
    let startTime: number;
    const duration = 1600;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      node.textContent = prefix + (ease * end).toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, end, suffix, prefix, decimals]);

  return <span ref={nodeRef}>{prefix}0{suffix}</span>;
}

function MetricCard({ icon: Icon, label, value, suffix, prefix, change, changeLabel, color, bg, border, glow, index }: MetricCardProps) {
  const positive = change > 0;
  const neutral = change === 0;
  const TrendIcon = neutral ? Minus : positive ? TrendingUp : TrendingDown;
  const trendColor = neutral ? "text-muted-foreground/50" : positive ? "text-emerald-400" : "text-rose-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] as const }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      data-testid={`overview-card-${index}`}
      className="relative group rounded-2xl border bg-card/70 backdrop-blur-sm p-6 overflow-hidden cursor-default"
      style={{ borderColor: border.replace("border-", "") }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${bg} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ boxShadow: `inset 0 0 0 1px ${glow}` }}
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-10 h-10 rounded-xl ${bg} border flex items-center justify-center`} style={{ borderColor: border.replace("border-", "") }}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          {change !== 0 && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="w-3 h-3" />
              <span>{Math.abs(change)}{suffix === "%" ? "" : "%"}</span>
            </div>
          )}
        </div>

        <div className={`text-3xl font-bold tracking-tight mb-1 ${color}`}>
          <CountUp end={value} suffix={suffix} prefix={prefix} decimals={value % 1 !== 0 ? 1 : 0} />
        </div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground/50 mt-0.5">{changeLabel}</div>
      </div>
    </motion.div>
  );
}

export function HealthOverviewCards() {
  const { data, isLoading } = useQuery<OverviewData>({
    queryKey: ["dashboard", "overview"],
    queryFn: () => fetch("/api/dashboard/overview").then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border bg-card/70 backdrop-blur-sm p-6 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-white/5 mb-4" />
            <div className="h-8 w-20 bg-white/5 rounded mb-2" />
            <div className="h-4 w-16 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cards = cardConfigs.map((cfg) => {
    const value = data ? data[cfg.key] : 0;
    const changeValue = cfg.changeKey && data ? data[cfg.changeKey] : 0;
    return {
      icon: cfg.icon,
      label: cfg.label,
      value,
      suffix: cfg.suffix,
      change: changeValue,
      changeLabel: cfg.changeLabel,
      color: cfg.color,
      bg: cfg.bg,
      border: cfg.border,
      glow: cfg.glow,
    };
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => (
        <MetricCard key={i} {...c} index={i} />
      ))}
    </div>
  );
}
