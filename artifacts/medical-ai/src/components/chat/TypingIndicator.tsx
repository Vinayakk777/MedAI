import { motion } from "framer-motion";
import { Activity } from "lucide-react";

export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className="flex items-end gap-3"
    >
      <motion.div
        animate={{ boxShadow: ["0 0 0 0 rgba(6,182,212,0.3)", "0 0 0 6px rgba(6,182,212,0)", "0 0 0 0 rgba(6,182,212,0)"] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0"
      >
        <Activity className="w-4 h-4 text-primary" />
      </motion.div>

      <div className="bg-card/80 border border-white/8 backdrop-blur-sm rounded-2xl rounded-bl-sm px-5 py-3.5 flex flex-col gap-1.5 shadow-lg">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
              className="w-1.5 h-1.5 bg-primary rounded-full"
            />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground/50 font-medium tracking-wide">
          MedAI is thinking...
        </span>
      </div>
    </motion.div>
  );
}
