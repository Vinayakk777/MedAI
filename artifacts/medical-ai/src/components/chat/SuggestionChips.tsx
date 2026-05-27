import { motion } from "framer-motion";
import {
  Stethoscope,
  Pill,
  HeartPulse,
  Thermometer,
  Brain,
  ShieldAlert,
} from "lucide-react";

const chips = [
  { icon: Stethoscope, label: "Describe my symptoms", color: "text-cyan-400" },
  { icon: Pill, label: "Check drug interaction", color: "text-violet-400" },
  { icon: HeartPulse, label: "Heart health checkup", color: "text-rose-400" },
  { icon: Thermometer, label: "I have a fever", color: "text-amber-400" },
  { icon: Brain, label: "Mental health support", color: "text-emerald-400" },
  { icon: ShieldAlert, label: "When to see a doctor?", color: "text-sky-400" },
];

interface SuggestionChipsProps {
  onSelect: (label: string) => void;
}

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
      {chips.map((chip, i) => {
        const Icon = chip.icon;
        return (
          <motion.button
            key={i}
            initial={{ opacity: 0, scale: 0.9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04, ease: "easeOut" }}
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(chip.label)}
            data-testid={`chip-suggestion-${i}`}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-white/8 bg-card/60 backdrop-blur-sm text-xs text-muted-foreground hover:text-foreground hover:border-white/15 hover:bg-card transition-all duration-200 whitespace-nowrap flex-shrink-0"
          >
            <Icon className={`w-3.5 h-3.5 ${chip.color} flex-shrink-0`} />
            {chip.label}
          </motion.button>
        );
      })}
    </div>
  );
}
