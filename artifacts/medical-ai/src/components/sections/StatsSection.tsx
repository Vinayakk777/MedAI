import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Users, MessageSquare, Clock, ShieldCheck } from "lucide-react";

interface StatProps {
  end: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
}

function AnimatedCounter({ end, suffix = "", prefix = "", decimals = 0, duration = 2 }: StatProps) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.3 }
    );
    if (nodeRef.current) observer.observe(nodeRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || !nodeRef.current) return;
    const node = nodeRef.current;
    const controls = animate(0, end, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(value) {
        node.textContent = prefix + value.toFixed(decimals) + suffix;
      },
    });
    return () => controls.stop();
  }, [inView, end, suffix, prefix, decimals, duration]);

  return <span ref={nodeRef}>{prefix}0{suffix}</span>;
}

const stats = [
  {
    icon: Users,
    prefix: "",
    value: 2400000,
    suffix: "+",
    display: "2.4M+",
    label: "Active Patients",
    description: "Trusting MedAI for daily health guidance",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    glow: "rgba(6,182,212,0.12)",
  },
  {
    icon: MessageSquare,
    prefix: "",
    value: 50,
    suffix: "M+",
    display: "50M+",
    label: "Queries Answered",
    description: "Evidence-based responses delivered",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    glow: "rgba(139,92,246,0.12)",
  },
  {
    icon: Clock,
    prefix: "<",
    value: 2,
    suffix: "s",
    display: "<2s",
    label: "Response Time",
    description: "Average time to first insight",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    glow: "rgba(16,185,129,0.12)",
  },
  {
    icon: ShieldCheck,
    prefix: "",
    value: 99.9,
    suffix: "%",
    display: "99.9%",
    label: "Uptime SLA",
    description: "Enterprise-grade reliability",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    glow: "rgba(245,158,11,0.12)",
  },
];

export function StatsSection() {
  return (
    <section className="py-24 bg-card relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_50%,rgba(6,182,212,0.04),transparent)] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium tracking-wider uppercase mb-5">
            By the numbers
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Trusted at scale
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                data-testid={`stat-card-${index}`}
                className="group relative"
              >
                <div
                  className={`relative rounded-2xl border ${stat.border} bg-background/60 backdrop-blur-sm p-7 overflow-hidden transition-all duration-300 hover:shadow-lg`}
                  style={{
                    boxShadow: `0 0 0 0 ${stat.glow}`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 30px 0 ${stat.glow}, 0 10px 30px rgba(0,0,0,0.2)`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 0 ${stat.glow}`;
                  }}
                >
                  <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${stat.color.replace("text-", "via-")}/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                  <div className={`w-11 h-11 rounded-xl ${stat.bg} flex items-center justify-center mb-5`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>

                  <div className={`text-4xl font-bold tracking-tight mb-1 ${stat.color}`}>
                    <AnimatedCounter
                      end={stat.value}
                      suffix={stat.suffix}
                      prefix={stat.prefix}
                      decimals={stat.value % 1 !== 0 ? 1 : 0}
                      duration={2.2}
                    />
                  </div>

                  <div className="text-base font-semibold text-foreground mb-1.5">
                    {stat.label}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {stat.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
