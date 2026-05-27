import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Search, Clock, AlertTriangle, CheckCircle, Info } from "lucide-react";

const MEDICATIONS = [
  {
    name: "Lisinopril",
    dose: "10mg",
    frequency: "Once daily",
    category: "ACE Inhibitor",
    purpose: "Blood pressure",
    time: "Morning",
    interactions: ["Ibuprofen", "Potassium supplements"],
    status: "active",
    refillDays: 12,
    color: "text-cyan-400",
    bg: "bg-cyan-500/8",
    border: "border-cyan-500/15",
  },
  {
    name: "Metformin",
    dose: "500mg",
    frequency: "Twice daily",
    category: "Biguanide",
    purpose: "Blood glucose",
    time: "With meals",
    interactions: ["Alcohol", "IV contrast dye"],
    status: "active",
    refillDays: 28,
    color: "text-violet-400",
    bg: "bg-violet-500/8",
    border: "border-violet-500/15",
  },
  {
    name: "Atorvastatin",
    dose: "20mg",
    frequency: "Once daily",
    category: "Statin",
    purpose: "Cholesterol",
    time: "Evening",
    interactions: ["Grapefruit juice", "Gemfibrozil"],
    status: "active",
    refillDays: 5,
    color: "text-emerald-400",
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/15",
  },
  {
    name: "Cetirizine",
    dose: "10mg",
    frequency: "As needed",
    category: "Antihistamine",
    purpose: "Allergies",
    time: "Any time",
    interactions: ["Alcohol", "Sedatives"],
    status: "prn",
    refillDays: 45,
    color: "text-amber-400",
    bg: "bg-amber-500/8",
    border: "border-amber-500/15",
  },
];

export function MedicationLookup() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = MEDICATIONS.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.purpose.toLowerCase().includes(query.toLowerCase()) ||
      m.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      id="medications"
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-center gap-2 mb-1">
        <Pill className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-foreground">Medication Guide</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Your current prescriptions and interactions</p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search medications..."
          data-testid="input-medication-search"
          className="w-full pl-9 pr-4 py-2.5 bg-background/50 border border-white/8 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 transition-colors"
        />
      </div>

      <div className="space-y-2.5">
        <AnimatePresence>
          {filtered.map((med, i) => {
            const isExpanded = expanded === med.name;
            const lowRefill = med.refillDays <= 7;
            return (
              <motion.div
                key={med.name}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ delay: i * 0.05 }}
                data-testid={`medication-card-${med.name.toLowerCase()}`}
                className={`rounded-xl border ${med.border} ${med.bg} overflow-hidden cursor-pointer`}
                onClick={() => setExpanded(isExpanded ? null : med.name)}
              >
                <div className="flex items-center gap-3 p-4">
                  <div className={`w-9 h-9 rounded-lg ${med.bg} border ${med.border} flex items-center justify-center flex-shrink-0`}>
                    <Pill className={`w-4 h-4 ${med.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{med.name}</span>
                      <span className="text-[10px] font-medium text-muted-foreground/50 bg-white/5 px-2 py-0.5 rounded-full">{med.dose}</span>
                      {med.status === "prn" && (
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">PRN</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
                      <span>{med.purpose}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{med.time}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {lowRefill ? (
                      <div className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        Refill in {med.refillDays}d
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        {med.refillDays}d supply
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="border-t border-white/5 px-4 py-3 space-y-2"
                    >
                      <div className="flex items-start gap-2 text-xs">
                        <Info className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="text-muted-foreground/60 font-medium">Category: </span>
                          <span className="text-muted-foreground">{med.category}</span>
                          <span className="mx-2 text-muted-foreground/20">·</span>
                          <span className="text-muted-foreground/60 font-medium">Frequency: </span>
                          <span className="text-muted-foreground">{med.frequency}</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="text-muted-foreground/60 font-medium">Known interactions: </span>
                          <span className="text-amber-400/80">{med.interactions.join(", ")}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground/40 text-center py-6">No medications found</p>
        )}
      </div>
    </motion.div>
  );
}
