import { motion } from "framer-motion";
import { useState } from "react";
import {
  Stethoscope,
  Pill,
  FileText,
  CalendarCheck,
  Siren,
  BarChart3,
} from "lucide-react";

const features = [
  {
    icon: Stethoscope,
    title: "Symptom Checker",
    description:
      "Describe how you feel in plain language. MedAI maps your words to clinical patterns and surfaces the most likely conditions with evidence-backed confidence scores.",
    gradient: "from-cyan-500/20 to-teal-500/10",
    glow: "rgba(6,182,212,0.15)",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/10",
    badge: "Most used",
  },
  {
    icon: Pill,
    title: "Medication Guidance",
    description:
      "Instantly check drug interactions, dosage thresholds, and contraindications across your full medication list — powered by a continuously updated pharmacological database.",
    gradient: "from-violet-500/20 to-purple-500/10",
    glow: "rgba(139,92,246,0.15)",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    badge: null,
  },
  {
    icon: FileText,
    title: "AI Health Reports",
    description:
      "Generate structured, shareable health summaries from your conversation history. Send clinician-ready reports to your care team before your appointment.",
    gradient: "from-emerald-500/20 to-green-500/10",
    glow: "rgba(16,185,129,0.15)",
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-500/10",
    badge: "New",
  },
  {
    icon: CalendarCheck,
    title: "Appointment Assistance",
    description:
      "Tell MedAI your symptoms and it identifies the right specialist, helps you prepare the right questions, and connects directly to your provider's scheduling system.",
    gradient: "from-sky-500/20 to-blue-500/10",
    glow: "rgba(14,165,233,0.15)",
    iconColor: "text-sky-400",
    iconBg: "bg-sky-500/10",
    badge: null,
  },
  {
    icon: Siren,
    title: "Emergency Guidance",
    description:
      "Built-in red-flag detection instantly identifies symptoms that warrant emergency care. One tap connects you to 911 with your location and a clinical summary.",
    gradient: "from-rose-500/20 to-red-500/10",
    glow: "rgba(244,63,94,0.15)",
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
    badge: "Critical",
  },
  {
    icon: BarChart3,
    title: "Health Tracking",
    description:
      "Log symptoms, vitals, and moods over time. MedAI surfaces trends your doctor needs to know, turning scattered data points into a coherent longitudinal health story.",
    gradient: "from-amber-500/20 to-orange-500/10",
    glow: "rgba(245,158,11,0.15)",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
    badge: null,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

export function FeaturesSection() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section
      id="features"
      className="py-28 bg-background relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(6,182,212,0.06),transparent)] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium tracking-wider uppercase mb-6">
            Capabilities
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-5 text-foreground leading-tight">
            Everything your health
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-400">
              deserves to know
            </span>
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Six precision tools, one intelligent interface — built around the
            patient, not the paperwork.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            const isHovered = hovered === index;

            return (
              <motion.div
                key={index}
                variants={cardVariants}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                data-testid={`feature-card-${index}`}
                className="relative group cursor-default"
              >
                <div
                  className="absolute -inset-px rounded-2xl transition-opacity duration-500"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    background: `linear-gradient(135deg, ${feature.glow.replace("0.15", "0.5")}, transparent 60%)`,
                  }}
                />

                <div
                  className={`relative h-full rounded-2xl border border-white/5 bg-card/80 backdrop-blur-sm p-7 overflow-hidden transition-all duration-500 ${
                    isHovered ? "border-white/10 shadow-2xl" : ""
                  }`}
                  style={{
                    boxShadow: isHovered
                      ? `0 0 40px ${feature.glow}, 0 20px 40px rgba(0,0,0,0.3)`
                      : "none",
                  }}
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />

                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-5">
                      <div
                        className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center transition-transform duration-300 ${isHovered ? "scale-110" : ""}`}
                      >
                        <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                      </div>
                      {feature.badge && (
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            feature.badge === "Critical"
                              ? "border-rose-500/30 text-rose-400 bg-rose-500/10"
                              : feature.badge === "New"
                                ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                : "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
                          }`}
                        >
                          {feature.badge}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-semibold text-foreground mb-3 tracking-tight">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>

                    <div
                      className={`mt-5 flex items-center gap-1.5 text-xs font-medium transition-all duration-300 ${feature.iconColor} ${isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"}`}
                    >
                      <span>Learn more</span>
                      <span>→</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
