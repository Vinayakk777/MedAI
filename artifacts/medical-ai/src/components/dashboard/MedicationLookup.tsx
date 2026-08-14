import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pill, Search, Clock, AlertTriangle, CheckCircle, Info, Plus, X, BookOpen, FlaskConical, Activity } from "lucide-react";

type MedicationRecord = {
  id: string;
  name: string;
  dose: string | null;
  frequency: string | null;
  category: string | null;
  purpose: string | null;
  timeOfDay: string | null;
  interactions: string[] | null;
  status: string;
  refillDays: number | null;
  startedAt: string | null;
};

type MedicationGuideEntry = {
  id: string;
  name: string;
  genericName: string;
  brandNames: string[];
  drugClass: string;
  category: string;
  diseasesTreated: string[];
  symptomsTreated: string[];
  chemicalFormula: string;
  molecularWeight: string;
  mechanismOfAction: string;
  typicalDosage: string;
  onset: string;
  duration: string;
  sideEffects: string[];
  interactions: string[];
  contraindications: string[];
  isPrescription: boolean;
  pregnancyRisk: string;
  alcoholInteraction: string;
};

const categoryStyles: Record<string, { color: string; bg: string; border: string }> = {
  "ACE Inhibitor":   { color: "text-cyan-400", bg: "bg-cyan-500/8", border: "border-cyan-500/15" },
  "Biguanide":       { color: "text-violet-400", bg: "bg-violet-500/8", border: "border-violet-500/15" },
  "Statin":          { color: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/15" },
  "Antihistamine":   { color: "text-amber-400", bg: "bg-amber-500/8", border: "border-amber-500/15" },
  "Antibiotic":      { color: "text-rose-400", bg: "bg-rose-500/8", border: "border-rose-500/15" },
  "Antidepressant":  { color: "text-sky-400", bg: "bg-sky-500/8", border: "border-sky-500/15" },
  "PPI":             { color: "text-teal-400", bg: "bg-teal-500/8", border: "border-teal-500/15" },
  default:           { color: "text-muted-foreground", bg: "bg-white/5", border: "border-white/8" },
};

function getStyle(category: string | null) {
  return categoryStyles[category ?? ""] ?? categoryStyles.default;
}

function getGuideStyle(category: string) {
  const map: Record<string, string> = {
    "Pain & Fever": "text-rose-400 bg-rose-500/8 border-rose-500/15",
    "Antibiotics": "text-amber-400 bg-amber-500/8 border-amber-500/15",
    "Diabetes": "text-violet-400 bg-violet-500/8 border-violet-500/15",
    "Cholesterol": "text-emerald-400 bg-emerald-500/8 border-emerald-500/15",
    "Blood Pressure": "text-cyan-400 bg-cyan-500/8 border-cyan-500/15",
    "Acidity & GERD": "text-teal-400 bg-teal-500/8 border-teal-500/15",
    "Allergy": "text-amber-400 bg-amber-500/8 border-amber-500/15",
    "Asthma & Respiratory": "text-sky-400 bg-sky-500/8 border-sky-500/15",
    "Mental Health": "text-indigo-400 bg-indigo-500/8 border-indigo-500/15",
    "Thyroid": "text-pink-400 bg-pink-500/8 border-pink-500/15",
    "Nausea & Digestion": "text-orange-400 bg-orange-500/8 border-orange-500/15",
    "Blood Thinner": "text-rose-400 bg-rose-500/8 border-rose-500/15",
    "Inflammation & Autoimmune": "text-red-400 bg-red-500/8 border-red-500/15",
    "Nausea & Migraine": "text-orange-400 bg-orange-500/8 border-orange-500/15",
    "Pain, Fever & Inflammation": "text-rose-400 bg-rose-500/8 border-rose-500/15",
    "Pain, Fever & Heart Health": "text-rose-400 bg-rose-500/8 border-rose-500/15",
    "Blood Pressure & Kidney Protection": "text-cyan-400 bg-cyan-500/8 border-cyan-500/15",
    "Blood Pressure & Heart Failure": "text-cyan-400 bg-cyan-500/8 border-cyan-500/15",
    "Blood Pressure & Edema": "text-cyan-400 bg-cyan-500/8 border-cyan-500/15",
    "Nausea & Vomiting": "text-orange-400 bg-orange-500/8 border-orange-500/15",
  };
  return map[category] ?? "text-muted-foreground bg-white/5 border-white/8";
}

export function MedicationLookup() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "guide">("mine");
  const [guideQuery, setGuideQuery] = useState("");
  const [guideExpanded, setGuideExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<MedicationRecord[]>({
    queryKey: ["dashboard", "medications"],
    queryFn: () => fetch("/api/dashboard/medications").then((r) => r.json()),
  });

  const guideQueryData = useQuery<MedicationGuideEntry[]>({
    queryKey: ["dashboard", "medication-guide", guideQuery],
    queryFn: () => fetch(`/api/dashboard/medication-guide?q=${encodeURIComponent(guideQuery)}`).then((r) => r.json()),
    enabled: tab === "guide",
  });

  const deleteMed = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/dashboard/medications/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard", "medications"] }),
  });

  const records = data ?? [];

  const filtered = records.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      (m.purpose ?? "").toLowerCase().includes(query.toLowerCase()) ||
      (m.category ?? "").toLowerCase().includes(query.toLowerCase()),
  );

  const guideRecords = guideQueryData.data ?? [];

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

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setTab("mine")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
            tab === "mine"
              ? "bg-violet-500/12 text-violet-300 border border-violet-500/25"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/8"
          }`}
        >
          <Pill className="w-3 h-3" />
          My Medications
        </button>
        <button
          onClick={() => setTab("guide")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
            tab === "guide"
              ? "bg-emerald-500/12 text-emerald-300 border border-emerald-500/25"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/8"
          }`}
        >
          <BookOpen className="w-3 h-3" />
          Reference Guide
        </button>
      </div>

      {tab === "mine" ? (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            {records.length > 0 ? "Your current prescriptions and interactions" : "No medications recorded yet"}
          </p>

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

          {isLoading ? (
            <div className="space-y-2.5 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-4">
                  <div className="h-4 w-32 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              <AnimatePresence>
                {filtered.map((med, i) => {
                  const isExpanded = expanded === med.name;
                  const style = getStyle(med.category);
                  const lowRefill = med.refillDays != null && med.refillDays <= 7;
                  return (
                    <motion.div
                      key={med.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ delay: i * 0.05 }}
                      data-testid={`medication-card-${med.name.toLowerCase()}`}
                      className={`rounded-xl border ${style.border} ${style.bg} overflow-hidden cursor-pointer`}
                      onClick={() => setExpanded(isExpanded ? null : med.id)}
                    >
                      <div className="flex items-center gap-3 p-4">
                        <div className={`w-9 h-9 rounded-lg ${style.bg} border ${style.border} flex items-center justify-center flex-shrink-0`}>
                          <Pill className={`w-4 h-4 ${style.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{med.name}</span>
                            {med.dose && (
                              <span className="text-[10px] font-medium text-muted-foreground/50 bg-white/5 px-2 py-0.5 rounded-full">{med.dose}</span>
                            )}
                            {med.status === "prn" && (
                              <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">PRN</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
                            <span>{med.purpose ?? med.category ?? "Medication"}</span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />{med.timeOfDay ?? "As directed"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 flex items-center gap-2">
                          {med.refillDays != null && (
                            lowRefill ? (
                              <div className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                Refill in {med.refillDays}d
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                                <CheckCircle className="w-3 h-3" />
                                {med.refillDays}d supply
                              </div>
                            )
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteMed.mutate(med.id); }}
                            className="p-1 rounded-md text-muted-foreground/20 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            aria-label="Delete medication"
                          >
                            <X className="w-3 h-3" />
                          </button>
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
                                <span className="text-muted-foreground">{med.category ?? "—"}</span>
                                <span className="mx-2 text-muted-foreground/20">·</span>
                                <span className="text-muted-foreground/60 font-medium">Frequency: </span>
                                <span className="text-muted-foreground">{med.frequency ?? "—"}</span>
                              </div>
                            </div>
                            {med.interactions && med.interactions.length > 0 && (
                              <div className="flex items-start gap-2 text-xs">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-muted-foreground/60 font-medium">Known interactions: </span>
                                  <span className="text-amber-400/80">{med.interactions.join(", ")}</span>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {!isLoading && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground/40 text-center py-6">
                  {query ? "No medications found" : "No medications yet — add your first medication"}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-4">
            Search common medications by name, disease, or symptom to see what it treats, its chemical formula, and more.
          </p>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
            <input
              value={guideQuery}
              onChange={(e) => setGuideQuery(e.target.value)}
              placeholder="Search by disease, drug, or symptom (e.g. fever, allergy, metformin)..."
              className="w-full pl-9 pr-4 py-2.5 bg-background/50 border border-white/8 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 transition-colors"
            />
          </div>

          {guideQueryData.isLoading ? (
            <div className="space-y-2.5 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-4">
                  <div className="h-4 w-32 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          ) : guideRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground/40 text-center py-6">
              {guideQuery ? "No medications match your search" : "Start typing to explore the medication reference"}
            </p>
          ) : (
            <div className="space-y-2.5">
              <AnimatePresence>
                {guideRecords.map((med, i) => {
                  const isExpanded = guideExpanded === med.id;
                  const styleClass = getGuideStyle(med.category);
                  return (
                    <motion.div
                      key={med.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ delay: i * 0.03 }}
                      className={`rounded-xl border ${styleClass} overflow-hidden cursor-pointer`}
                      onClick={() => setGuideExpanded(isExpanded ? null : med.id)}
                    >
                      <div className="flex items-center gap-3 p-4">
                        <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                          <Pill className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{med.name}</span>
                            <span className="text-[10px] font-medium text-muted-foreground/50 bg-white/5 px-2 py-0.5 rounded-full">{med.genericName}</span>
                            {med.isPrescription && (
                              <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">Rx</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground/60">
                            <span>{med.drugClass}</span>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <FlaskConical className="w-2.5 h-2.5" />
                              {med.chemicalFormula}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 max-w-[180px] justify-end">
                          {med.diseasesTreated.slice(0, 3).map((d) => (
                            <span key={d} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground/60 border border-white/8">{d}</span>
                          ))}
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="border-t border-white/5 px-4 py-3 space-y-3"
                          >
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg bg-white/4 border border-white/8 p-2.5">
                                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Symptoms it treats</p>
                                <div className="flex flex-wrap gap-1">
                                  {med.symptomsTreated.map((s) => (
                                    <span key={s} className="text-[10px] text-foreground/80 bg-white/5 px-1.5 py-0.5 rounded-full">{s}</span>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-lg bg-white/4 border border-white/8 p-2.5">
                                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Treats these conditions</p>
                                <div className="flex flex-wrap gap-1">
                                  {med.diseasesTreated.map((d) => (
                                    <span key={d} className="text-[10px] text-foreground/80 bg-white/5 px-1.5 py-0.5 rounded-full">{d}</span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-lg bg-white/4 border border-white/8 p-2.5">
                              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <FlaskConical className="w-3 h-3" /> Chemical info
                              </p>
                              <p className="text-xs text-foreground/80">
                                Formula: <span className="font-mono text-emerald-300/90">{med.chemicalFormula}</span>
                                <span className="mx-2 text-muted-foreground/30">·</span>
                                MW: {med.molecularWeight}
                                <span className="mx-2 text-muted-foreground/30">·</span>
                                Class: {med.drugClass}
                              </p>
                              <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">{med.mechanismOfAction}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg bg-white/4 border border-white/8 p-2.5">
                                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Dosage & timing</p>
                                <p className="text-[11px] text-foreground/80">{med.typicalDosage}</p>
                                <p className="text-[10px] text-muted-foreground/60 mt-1">Onset: {med.onset} · Duration: {med.duration}</p>
                              </div>
                              <div className="rounded-lg bg-white/4 border border-white/8 p-2.5">
                                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Brand names</p>
                                <div className="flex flex-wrap gap-1">
                                  {med.brandNames.map((b) => (
                                    <span key={b} className="text-[10px] text-foreground/80 bg-white/5 px-1.5 py-0.5 rounded-full">{b}</span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg bg-rose-500/5 border border-rose-500/15 p-2.5">
                                <p className="text-[10px] font-semibold text-rose-400/80 uppercase tracking-wider mb-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Side effects
                                </p>
                                <ul className="space-y-1">
                                  {med.sideEffects.map((s) => (
                                    <li key={s} className="text-[11px] text-foreground/70">• {s}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-2.5">
                                <p className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider mb-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Interactions
                                </p>
                                <ul className="space-y-1">
                                  {med.interactions.map((s) => (
                                    <li key={s} className="text-[11px] text-foreground/70">• {s}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg bg-white/4 border border-white/8 p-2.5">
                                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Contraindications</p>
                                <ul className="space-y-1">
                                  {med.contraindications.map((c) => (
                                    <li key={c} className="text-[11px] text-foreground/70">• {c}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="rounded-lg bg-white/4 border border-white/8 p-2.5">
                                <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Pregnancy & alcohol</p>
                                <p className="text-[11px] text-foreground/80">
                                  <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-pink-400/70" /> {med.pregnancyRisk}</span>
                                </p>
                                <p className="text-[11px] text-foreground/80 mt-1.5">
                                  <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400/70" /> Alcohol: {med.alcoholInteraction}</span>
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
