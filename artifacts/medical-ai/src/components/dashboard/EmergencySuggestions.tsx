import { motion } from "framer-motion";
import { Siren, Phone, ChevronRight, ShieldCheck } from "lucide-react";

const emergencies = [
  {
    severity: "CALL 911",
    color: "text-rose-400",
    bg: "bg-rose-500/8",
    border: "border-rose-500/20",
    dot: "bg-rose-500",
    symptoms: ["Chest pain or pressure", "Difficulty breathing", "Sudden numbness or weakness", "Severe allergic reaction (anaphylaxis)", "Uncontrolled bleeding"],
    action: "Call 911 immediately",
  },
  {
    severity: "URGENT CARE",
    color: "text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/20",
    dot: "bg-amber-500",
    symptoms: ["High fever (>103°F / 39.4°C)", "Severe or worsening headache", "Deep cuts or wounds", "Moderate burns", "Urinary tract infection symptoms"],
    action: "Go to urgent care today",
  },
  {
    severity: "SEE A DOCTOR",
    color: "text-sky-400",
    bg: "bg-sky-500/8",
    border: "border-sky-500/20",
    dot: "bg-sky-400",
    symptoms: ["Persistent fever (>48 hrs)", "Ear or sinus pain", "Worsening cough", "Rash with fever", "Ongoing joint pain"],
    action: "Schedule within 24–48 hours",
  },
];

export function EmergencySuggestions() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      id="emergency"
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Siren className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-foreground">Emergency Guide</h3>
        </div>
        <a
          href="tel:911"
          data-testid="link-call-911"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/15 transition-colors"
        >
          <Phone className="w-3.5 h-3.5" />
          Call 911
        </a>
      </div>
      <p className="text-xs text-muted-foreground mb-5">Know when to escalate — act fast when it matters</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {emergencies.map((level, i) => (
          <motion.div
            key={level.severity}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 + i * 0.08, duration: 0.4 }}
            data-testid={`emergency-level-${i}`}
            className={`rounded-xl border ${level.border} ${level.bg} p-4`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${level.dot} animate-pulse`} />
              <span className={`text-[11px] font-bold tracking-wider ${level.color}`}>{level.severity}</span>
            </div>
            <ul className="space-y-1.5 mb-3">
              {level.symptoms.map((s, j) => (
                <li key={j} className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-tight">
                  <span className={`mt-1 w-1 h-1 rounded-full ${level.dot} flex-shrink-0 opacity-70`} />
                  {s}
                </li>
              ))}
            </ul>
            <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${level.color} mt-3 pt-3 border-t border-white/5`}>
              <ChevronRight className="w-3.5 h-3.5" />
              {level.action}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-4 py-3 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground/70">Medical Disclaimer:</strong> This guide is for informational purposes only. MedAI does not provide emergency medical advice. Always trust your instincts — when in doubt, call 911 or go to your nearest emergency room.
        </p>
      </div>
    </motion.div>
  );
}
