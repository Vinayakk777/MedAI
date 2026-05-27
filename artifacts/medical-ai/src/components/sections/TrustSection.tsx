import { motion } from "framer-motion";
import { ShieldCheck, Lock, FileCheck, HeartPulse, Zap } from "lucide-react";

const trustBadges = [
  {
    icon: ShieldCheck,
    title: "HIPAA Certified",
    description: "Full compliance with all U.S. healthcare data privacy regulations.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/8",
    border: "border-cyan-500/15",
  },
  {
    icon: Lock,
    title: "256-bit Encryption",
    description: "Military-grade AES encryption on all data in transit and at rest.",
    color: "text-violet-400",
    bg: "bg-violet-500/8",
    border: "border-violet-500/15",
  },
  {
    icon: FileCheck,
    title: "SOC 2 Type II",
    description: "Independently audited security, availability, and confidentiality controls.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/15",
  },
  {
    icon: Zap,
    title: "Zero Data Retention",
    description: "Your conversations are never stored, sold, or used to train external models.",
    color: "text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/15",
  },
];

export function TrustSection() {
  return (
    <section className="py-24 bg-card relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium tracking-wider uppercase mb-5">
            Security & Compliance
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
            Built on a foundation of{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-400">
              absolute trust
            </span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Healthcare is the most sensitive context imaginable. Every architectural decision at MedAI starts with privacy.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {trustBadges.map((badge, index) => {
            const Icon = badge.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                data-testid={`trust-badge-${index}`}
                className={`group rounded-2xl border ${badge.border} bg-background/60 p-6 hover:bg-background/80 transition-all duration-300`}
              >
                <div className={`w-11 h-11 rounded-xl ${badge.bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 ${badge.color}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-sm">{badge.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{badge.description}</p>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative rounded-2xl overflow-hidden border border-rose-500/10 bg-background/60 p-1"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-rose-500/5 via-transparent to-rose-500/5 pointer-events-none" />
          <div className="relative flex flex-col md:flex-row items-center gap-5 px-7 py-6 rounded-xl">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <HeartPulse className="w-7 h-7 text-rose-400" />
            </div>
            <div className="flex-grow text-center md:text-left">
              <h4 className="font-semibold text-foreground mb-1">
                Important Medical Disclaimer
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                MedAI provides educational health information and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the guidance of your physician or qualified healthcare provider with any medical questions. In an emergency, call 911 immediately.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
