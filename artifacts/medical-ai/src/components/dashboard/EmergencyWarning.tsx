import { motion } from "framer-motion";
import {
  ShieldAlert, AlertTriangle, Phone, Heart, Activity,
  Clock, MapPin, ChevronDown, ChevronUp,
} from "lucide-react";

interface EmergencyWarningProps {
  careLevel: "emergency_today" | "emergency_now";
  urgencyLabel: string;
  reason: string;
  preparationInstructions: string[];
  whatToBring: string[];
  whatToTellDoctor: string[];
  onDismiss: () => void;
}

export function EmergencyWarning({
  careLevel,
  urgencyLabel,
  reason,
  preparationInstructions,
  whatToBring,
  whatToTellDoctor,
  onDismiss,
}: EmergencyWarningProps) {
  const isNow = careLevel === "emergency_now";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-lg rounded-2xl border-2 border-rose-500/40 bg-gradient-to-b from-rose-950/90 to-card shadow-[0_0_60px_rgba(244,63,94,0.15)] overflow-hidden"
      >
        {/* Emergency header */}
        <div className="relative p-6 pb-4 text-center">
          <div className="absolute inset-0 bg-rose-500/5" />
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="relative"
          >
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-rose-500/20 border-2 border-rose-400/30 flex items-center justify-center">
              {isNow ? (
                <Phone className="w-7 h-7 text-rose-400" />
              ) : (
                <AlertTriangle className="w-7 h-7 text-rose-400" />
              )}
            </div>
          </motion.div>

          <h2 className="text-xl font-bold text-rose-300 relative">
            {isNow ? "Call Emergency Services NOW" : "Go to the Emergency Department"}
          </h2>
          <p className="text-xs text-rose-400/60 mt-1 font-medium relative">{urgencyLabel}</p>
        </div>

        {/* Reason */}
        <div className="px-6 pb-3">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-rose-200 leading-relaxed">{reason}</p>
            </div>
          </div>
        </div>

        {/* First aid / actions */}
        <div className="px-6 pb-3 space-y-2">
          {isNow && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className="w-3.5 h-3.5 text-rose-400" />
                <h4 className="text-[10px] font-semibold text-rose-300 uppercase tracking-wider">While Waiting for Help</h4>
              </div>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-[11px] text-rose-200/80">
                  <span className="text-rose-400/60 mt-0.5">•</span>
                  Stay calm and try to breathe slowly
                </li>
                <li className="flex items-start gap-2 text-[11px] text-rose-200/80">
                  <span className="text-rose-400/60 mt-0.5">•</span>
                  Loosen any tight clothing
                </li>
                <li className="flex items-start gap-2 text-[11px] text-rose-200/80">
                  <span className="text-rose-400/60 mt-0.5">•</span>
                  Sit or lie down in a comfortable position
                </li>
                <li className="flex items-start gap-2 text-[11px] text-rose-200/80">
                  <span className="text-rose-400/60 mt-0.5">•</span>
                  Do not eat or drink anything
                </li>
                <li className="flex items-start gap-2 text-[11px] text-rose-200/80">
                  <span className="text-rose-400/60 mt-0.5">•</span>
                  If possible, unlock the door for emergency personnel
                </li>
              </ul>
            </div>
          )}

          {preparationInstructions.length > 0 && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">Steps to Take</h4>
              <ul className="space-y-1">
                {preparationInstructions.map((pi, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <span className="text-primary/50 mt-0.5">•</span>
                    {pi}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {whatToBring.length > 0 && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">What to Bring</h4>
              <div className="flex flex-wrap gap-1.5">
                {whatToBring.map((item, i) => (
                  <span key={i} className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-muted-foreground">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {whatToTellDoctor.length > 0 && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <h4 className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">What to Tell the Doctor</h4>
              <ul className="space-y-1">
                {whatToTellDoctor.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <span className="text-primary/50 mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Emergency numbers */}
        <div className="px-6 pb-4">
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Phone className="w-3.5 h-3.5 text-rose-400" />
              <h4 className="text-[10px] font-semibold text-rose-300 uppercase tracking-wider">Emergency Numbers</h4>
            </div>
            <p className="text-xs text-rose-200">
              India: <strong className="text-rose-300">108</strong>
            </p>
            <p className="text-[10px] text-rose-200/60 mt-0.5">
              US: 911 | UK: 999 | EU: 112 | Australia: 000
            </p>
          </div>
        </div>

        {/* Dismiss */}
        <div className="px-6 pb-6">
          <button
            onClick={onDismiss}
            className="w-full py-2.5 rounded-xl text-xs font-medium text-muted-foreground/50 hover:text-foreground hover:bg-white/5 border border-white/10 transition-all"
          >
            I understand — dismiss this warning
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
