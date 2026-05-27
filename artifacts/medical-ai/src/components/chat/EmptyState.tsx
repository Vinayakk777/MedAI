import { motion } from "framer-motion";
import {
  Stethoscope,
  Pill,
  CalendarCheck,
  FileText,
} from "lucide-react";
import { Activity } from "lucide-react";

const quickActions = [
  {
    icon: Stethoscope,
    title: "Symptom Check",
    description: "Describe how you're feeling",
    prompt: "I'd like to describe some symptoms I've been experiencing.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/8",
    border: "border-cyan-500/15",
  },
  {
    icon: Pill,
    title: "Medication Guide",
    description: "Check interactions or dosage",
    prompt: "Can you help me understand my medications?",
    color: "text-violet-400",
    bg: "bg-violet-500/8",
    border: "border-violet-500/15",
  },
  {
    icon: CalendarCheck,
    title: "See a Doctor?",
    description: "Know when to seek care",
    prompt: "When should I see a doctor about my condition?",
    color: "text-emerald-400",
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/15",
  },
  {
    icon: FileText,
    title: "Health Report",
    description: "Summarize your health status",
    prompt: "Help me create a summary of my health concerns for my doctor.",
    color: "text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/15",
  },
];

interface EmptyStateProps {
  onSelect: (prompt: string) => void;
}

export function EmptyState({ onSelect }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center h-full py-12 px-4 max-w-2xl mx-auto"
    >
      <motion.div
        animate={{
          boxShadow: [
            "0 0 0 0 rgba(6,182,212,0.2)",
            "0 0 40px 8px rgba(6,182,212,0.15)",
            "0 0 0 0 rgba(6,182,212,0.2)",
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center mb-6"
      >
        <Activity className="w-8 h-8 text-primary" />
      </motion.div>

      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-2 text-center">
        How can I help you today?
      </h2>
      <p className="text-muted-foreground text-sm text-center max-w-sm mb-10 leading-relaxed">
        Describe your symptoms, ask about medications, or get guidance on when
        to seek care — I'm here 24/7.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 + i * 0.06, ease: "easeOut" }}
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(action.prompt)}
              data-testid={`quick-action-${i}`}
              className={`text-left p-4 rounded-2xl border ${action.border} ${action.bg} hover:border-white/15 transition-all duration-200 group`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl ${action.bg} border ${action.border} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-4.5 h-4.5 ${action.color}`} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground mb-0.5">
                    {action.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {action.description}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
