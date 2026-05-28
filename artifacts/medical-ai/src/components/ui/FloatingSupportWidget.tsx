import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  MessageCircle, X, Stethoscope, Siren, BookOpen,
  ChevronRight, Activity,
} from "lucide-react";

const ACTIONS = [
  {
    icon: Stethoscope,
    label: "Chat with MedAI",
    sub: "Get instant health guidance",
    href: "/chat",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
  },
  {
    icon: BookOpen,
    label: "Health Dashboard",
    sub: "View your health overview",
    href: "/dashboard",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
  },
  {
    icon: Siren,
    label: "Emergency Guide",
    sub: "Know when to call 911",
    href: "/dashboard#emergency",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
  },
];

export function FloatingSupportWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3"
      role="complementary"
      aria-label="Quick access menu"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }}
            className="w-72 rounded-2xl border border-white/8 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/5">
              <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">MedAI Support</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  <span className="text-[10px] text-emerald-400/80">Online · Avg 2s response</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-2 space-y-1">
              {ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.label} href={action.href}>
                    <motion.button
                      whileHover={{ x: 2 }}
                      transition={{ duration: 0.12 }}
                      onClick={() => setOpen(false)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/4 transition-colors text-left group"
                    >
                      <div className={`w-8 h-8 rounded-xl ${action.bg} border ${action.border} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${action.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{action.label}</p>
                        <p className="text-[10px] text-muted-foreground/50 truncate">{action.sub}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors flex-shrink-0" />
                    </motion.button>
                  </Link>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/5">
              <p className="text-[10px] text-muted-foreground/30 text-center leading-relaxed">
                MedAI is not a substitute for professional medical advice.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.15 }}
        aria-label={open ? "Close support menu" : "Open support menu"}
        aria-expanded={open}
        className="relative w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-[0_8px_32px_rgba(0,184,217,0.4)] hover:shadow-[0_8px_40px_rgba(0,184,217,0.6)] transition-shadow flex items-center justify-center"
      >
        {/* Ping ring — only when closed */}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20 pointer-events-none" />
        )}
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X className="w-5 h-5" />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <MessageCircle className="w-5 h-5" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
