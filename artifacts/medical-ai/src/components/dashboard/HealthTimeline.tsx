import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, ChevronDown, ChevronUp, AlertTriangle, Activity,
  Stethoscope, Pill, FlaskConical, ShieldAlert, Archive,
  Trash2, FileText, Search, Calendar, Filter, X,
  HeartPulse, Thermometer, Brain,
} from "lucide-react";

type SymptomEntry = {
  name: string;
  severity: string;
  duration: string;
  bodyLocation?: string;
  progression?: string;
};

type DiagnosisEntry = {
  name: string;
  confidence: string;
  supportingSymptoms: string[];
  warningSigns: string[];
};

type MedicationEntry = {
  name: string;
  purpose: string;
};

type LabEntry = {
  testName: string;
  priority: string;
  category: string;
};

type FollowUpAdvice = {
  condition: string;
  whenToSeekCare: string[];
};

type TimelineEntry = {
  id: string;
  conversationId: string;
  consultationDate: string;
  chiefComplaint: string | null;
  riskLevel: string | null;
  riskScore: number | null;
  outcome: string | null;
  followUpStatus: string | null;
  symptoms: SymptomEntry[];
  diagnoses: DiagnosisEntry[];
  redFlags: string[];
  labRecommendations: LabEntry[];
  imagingRecommendations: LabEntry[];
  medicationRecommendations: MedicationEntry[];
  drugInteractions: { description: string; severity: string }[];
  allergies: string[];
  chronicConditions: string[];
  followUpAdvice: FollowUpAdvice[];
  recoveryStatus: string | null;
  expectedRecoveryDays: string | null;
};

const severityColor = (val?: string) => {
  switch (val?.toLowerCase()) {
    case "critical": case "severe": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    case "moderate": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "mild": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    default: return "text-muted-foreground bg-white/5 border-white/10";
  }
};

const riskBadge = (level?: string | null) => {
  switch (level?.toLowerCase()) {
    case "critical": return "bg-rose-500/15 text-rose-400 border-rose-500/25";
    case "high": return "bg-orange-500/15 text-orange-400 border-orange-500/25";
    case "moderate": return "bg-amber-500/15 text-amber-400 border-amber-500/25";
    case "low": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
    default: return "bg-white/5 text-muted-foreground border-white/10";
  }
};

export function HealthTimeline() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "symptom" | "diagnosis">("all");
  const [filterValue, setFilterValue] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const queryClient = useQueryClient();

  const queryKey = filterMode !== "all" && filterValue.trim()
    ? ["health-timeline", filterMode, filterValue.trim()]
    : ["health-timeline"];

  const { data, isLoading, error } = useQuery<TimelineEntry[]>({
    queryKey,
    queryFn: () => {
      let url = "/api/memory/timeline";
      if (searchQuery.trim()) {
        url = `/api/memory/search?q=${encodeURIComponent(searchQuery.trim())}`;
      } else if (filterMode === "symptom" && filterValue.trim()) {
        url = `/api/memory/filter?symptom=${encodeURIComponent(filterValue.trim())}`;
      } else if (filterMode === "diagnosis" && filterValue.trim()) {
        url = `/api/memory/filter?diagnosis=${encodeURIComponent(filterValue.trim())}`;
      }
      return fetch(url).then((r) => r.json());
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/memory/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["health-timeline"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/memory/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["health-timeline"] }),
  });

  const records = data ?? [];

  const filtered = searchQuery.trim()
    ? records
    : records;

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Health Timeline</h3>
        </div>
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-4">
              <div className="h-4 w-48 bg-white/5 rounded mb-2" />
              <div className="h-3 w-32 bg-white/5 rounded" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-rose-500/15 bg-rose-500/5 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <h3 className="text-sm font-semibold text-foreground">Unable to Load Timeline</h3>
        </div>
        <p className="text-xs text-muted-foreground">Failed to fetch health timeline. Please try again later.</p>
      </motion.div>
    );
  }

  if (filtered.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Health Timeline</h3>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">
          {searchQuery || filterValue ? "No consultations match your search criteria." : "No consultation history yet. Start a chat to build your health timeline."}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Health Timeline</h3>
          <span className="text-[10px] text-muted-foreground/40 bg-white/5 px-1.5 py-0.5 rounded-md">
            {filtered.length}
          </span>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-all"
          aria-label="Toggle search"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search & Filter Bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
            <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                <input
                  type="text"
                  placeholder="Search consultations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => { setFilterMode("all"); setFilterValue(""); }}
                  className={`px-2.5 py-1.5 text-[10px] rounded-lg border transition-all ${filterMode === "all" ? "bg-primary/12 text-primary border-primary/20" : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground"}`}>
                  All
                </button>
                <button onClick={() => setFilterMode("symptom")}
                  className={`px-2.5 py-1.5 text-[10px] rounded-lg border transition-all ${filterMode === "symptom" ? "bg-primary/12 text-primary border-primary/20" : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground"}`}>
                  Symptom
                </button>
                <button onClick={() => setFilterMode("diagnosis")}
                  className={`px-2.5 py-1.5 text-[10px] rounded-lg border transition-all ${filterMode === "diagnosis" ? "bg-primary/12 text-primary border-primary/20" : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground"}`}>
                  Diagnosis
                </button>
              </div>
              {filterMode !== "all" && (
                <input
                  type="text"
                  placeholder={filterMode === "symptom" ? "Filter by symptom..." : "Filter by diagnosis..."}
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  className="w-full sm:w-40 px-3 py-1.5 text-xs rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/20 via-primary/10 to-transparent" />

        <div className="space-y-3">
          {filtered.map((entry) => (
            <TimelineCard
              key={entry.id}
              entry={entry}
              isExpanded={expandedId === entry.id}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              onArchive={() => archiveMutation.mutate(entry.id)}
              onDelete={() => { if (confirm("Delete this consultation record permanently?")) deleteMutation.mutate(entry.id); }}
            />
          ))}
        </div>
      </div>

      <p className="mt-4 text-[10px] text-muted-foreground/30 text-center">
        This timeline is AI-generated for informational purposes. Always consult a healthcare professional.
      </p>
    </motion.div>
  );
}

function TimelineCard({
  entry, isExpanded, onToggle, onArchive, onDelete,
}: {
  entry: TimelineEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const date = new Date(entry.consultationDate);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });

  const topDiagnoses = entry.diagnoses
    ?.sort((a, b) => {
      const order: Record<string, number> = { high: 3, moderate: 2, low: 1 };
      return (order[b.confidence.toLowerCase()] ?? 0) - (order[a.confidence.toLowerCase()] ?? 0);
    })
    .slice(0, 3) ?? [];

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div className={`absolute left-[9px] top-4 w-[13px] h-[13px] rounded-full border-2 z-10 ${riskBadge(entry.riskLevel)}`} />

      <motion.div
        layout
        className="rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/[0.05] transition-colors overflow-hidden"
      >
        {/* Header */}
        <button onClick={onToggle} className="w-full text-left p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-foreground">
                  {entry.chiefComplaint ?? "Consultation"}
                </span>
                {entry.riskLevel && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${riskBadge(entry.riskLevel)}`}>
                    {entry.riskLevel}
                  </span>
                )}
                {entry.recoveryStatus && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${
                    entry.recoveryStatus === "excellent" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : entry.recoveryStatus === "good" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}>
                    {entry.recoveryStatus}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {dateStr}
                </span>
                <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50" />}
            </div>
          </div>

          {/* Preview */}
          {!isExpanded && (
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground/40">
              {entry.symptoms.length > 0 && (
                <span>{entry.symptoms.length} symptom{entry.symptoms.length !== 1 ? "s" : ""}</span>
              )}
              {topDiagnoses.length > 0 && (
                <>
                  <span className="text-muted-foreground/20">|</span>
                  <span>{topDiagnoses.map((d) => d.name).join(", ")}</span>
                </>
              )}
              {entry.outcome && (
                <>
                  <span className="text-muted-foreground/20">|</span>
                  <span>{entry.outcome}</span>
                </>
              )}
            </div>
          )}
        </button>

        {/* Expanded Details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/5"
            >
              <div className="p-3 sm:p-4 space-y-4">
                {/* Symptoms */}
                {entry.symptoms.length > 0 && (
                  <Section title="Symptoms" icon={Thermometer}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {entry.symptoms.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                          <div className={`w-1.5 h-1.5 rounded-full ${severityColor(s.severity)}`} />
                          <div>
                            <span className="text-xs font-medium text-foreground">{s.name}</span>
                            <span className="text-[10px] text-muted-foreground/50 ml-1.5">
                              {s.severity} · {s.duration}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Diagnoses */}
                {entry.diagnoses.length > 0 && (
                  <Section title="Diagnoses Considered" icon={Brain}>
                    <div className="space-y-1.5">
                      {entry.diagnoses.map((d, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground">{d.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${
                              d.confidence === "High" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : d.confidence === "Moderate" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            }`}>
                              {d.confidence}%
                            </span>
                          </div>
                          {d.supportingSymptoms.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {d.supportingSymptoms.map((s, j) => (
                                <span key={j} className="text-[10px] text-muted-foreground/50 bg-white/5 px-1.5 py-0.5 rounded">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Red Flags */}
                {entry.redFlags.length > 0 && (
                  <Section title="Red Flags" icon={ShieldAlert}>
                    <div className="space-y-1">
                      {entry.redFlags.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                          <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                          <span className="text-xs text-rose-300">{f}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Lab Recommendations */}
                {entry.labRecommendations.length > 0 && (
                  <Section title="Lab Tests Recommended" icon={FlaskConical}>
                    <div className="space-y-1">
                      {entry.labRecommendations.map((l, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                          <FlaskConical className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                          <span className="text-xs text-foreground">{l.testName}</span>
                          <span className={`text-[10px] ml-auto px-1.5 py-0.5 rounded border font-medium ${
                            l.priority === "immediate" ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : l.priority === "soon" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          }`}>
                            {l.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Imaging */}
                {entry.imagingRecommendations.length > 0 && (
                  <Section title="Imaging Recommended" icon={Activity}>
                    <div className="space-y-1">
                      {entry.imagingRecommendations.map((l, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                          <Activity className="w-3 h-3 text-violet-400 flex-shrink-0" />
                          <span className="text-xs text-foreground">{l.testName}</span>
                          <span className={`text-[10px] ml-auto px-1.5 py-0.5 rounded border font-medium ${
                            l.priority === "immediate" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          }`}>
                            {l.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Medications */}
                {entry.medicationRecommendations.length > 0 && (
                  <Section title="Medications Discussed" icon={Pill}>
                    <div className="space-y-1">
                      {entry.medicationRecommendations.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                          <Pill className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          <span className="text-xs font-medium text-foreground">{m.name}</span>
                          <span className="text-[10px] text-muted-foreground/50 ml-1">{m.purpose}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Drug Interactions */}
                {entry.drugInteractions.length > 0 && (
                  <Section title="Drug Interactions" icon={ShieldAlert}>
                    <div className="space-y-1">
                      {entry.drugInteractions.map((di, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                          <span className="text-xs text-amber-300">{di.description}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Follow-up */}
                {entry.followUpAdvice.length > 0 && (
                  <Section title="Follow-up Plan" icon={Calendar}>
                    <div className="space-y-1.5">
                      {entry.followUpAdvice.map((f, i) => (
                        <div key={i} className="p-2 rounded-lg bg-white/5 border border-white/5">
                          <span className="text-xs font-medium text-foreground">{f.condition}</span>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {f.whenToSeekCare.map((w, j) => (
                              <span key={j} className="text-[10px] text-muted-foreground/50 bg-white/5 px-1.5 py-0.5 rounded">
                                {w}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                      {entry.expectedRecoveryDays && (
                        <p className="text-[10px] text-muted-foreground/40">
                          Expected recovery: {entry.expectedRecoveryDays}
                        </p>
                      )}
                    </div>
                  </Section>
                )}

                {/* Outcome & Risk */}
                <div className="grid grid-cols-2 gap-2">
                  {entry.outcome && (
                    <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                      <p className="text-[10px] text-muted-foreground/50">Outcome</p>
                      <p className="text-xs font-medium text-foreground mt-0.5">{entry.outcome}</p>
                    </div>
                  )}
                  {entry.riskScore != null && (
                    <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                      <p className="text-[10px] text-muted-foreground/50">Risk Score</p>
                      <p className="text-xs font-medium text-foreground mt-0.5">{entry.riskScore}/100</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  <button onClick={onArchive}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/5 border border-white/10 transition-all">
                    <Archive className="w-3 h-3" /> Archive
                  </button>
                  <button onClick={onDelete}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded-lg text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-all">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3 h-3 text-primary/60" />
        <h4 className="text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">{title}</h4>
      </div>
      {children}
    </div>
  );
}
