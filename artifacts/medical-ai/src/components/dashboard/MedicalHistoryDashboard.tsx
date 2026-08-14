import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  HeartPulse, Activity, Pill, Stethoscope, AlertTriangle,
  FlaskConical, ScanLine, Download, ChevronDown, ChevronUp,
  Calendar, ShieldAlert, Brain, Thermometer, Weight,
  Moon, Sun, Cigarette, Wine,
} from "lucide-react";

type HistorySummary = {
  activeConditions: { name: string; firstRecorded: string; lastRecorded: string; count: number }[];
  pastConditions: { name: string; firstRecorded: string; lastRecorded: string }[];
  allergies: string[];
  currentMedications: string[];
  medicationHistory: string[];
  labHistory: string[];
  imagingHistory: string[];
  lifestyleProfile: {
    smoking?: string;
    alcohol?: string;
    exercise?: string;
  };
  totalConsultations: number;
  lastConsultationDate: string | null;
  averageRiskScore: number | null;
};

const severityColor = (score: number | null) => {
  if (score == null) return "text-muted-foreground/30";
  if (score >= 70) return "text-rose-400";
  if (score >= 40) return "text-amber-400";
  return "text-emerald-400";
};

export function MedicalHistoryDashboard() {
  const [showAllMedications, setShowAllMedications] = useState(false);
  const [showAllLabs, setShowAllLabs] = useState(false);
  const [showAllImaging, setShowAllImaging] = useState(false);

  const { data, isLoading, error } = useQuery<HistorySummary>({
    queryKey: ["medical-history-summary"],
    queryFn: () => fetch("/api/memory/history-summary").then((r) => r.json()),
  });

  const handleExport = () => {
    const a = document.createElement("a");
    a.href = "/api/memory/export/all";
    a.download = `health-history-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  };

  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Medical History Summary</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-4">
              <div className="h-4 w-24 bg-white/5 rounded mb-2" />
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
          <h3 className="text-sm font-semibold text-foreground">Unable to Load Medical History</h3>
        </div>
        <p className="text-xs text-muted-foreground">Failed to fetch medical history. Please try again later.</p>
      </motion.div>
    );
  }

  if (!data) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Medical History Summary</h3>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">No medical history recorded yet.</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">Medical History Summary</h3>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/5 border border-white/10 transition-all">
          <Download className="w-3 h-3" /> Export
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatBox label="Consultations" value={String(data.totalConsultations)} icon={Calendar} />
        <StatBox label="Avg. Risk Score" value={data.averageRiskScore != null ? `${data.averageRiskScore}` : "N/A"}
          valueColor={severityColor(data.averageRiskScore)} icon={ShieldAlert} />
        <StatBox label="Last Visit" value={data.lastConsultationDate
          ? new Date(data.lastConsultationDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "N/A"} icon={Calendar} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active Conditions */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Active Conditions</h4>
          </div>
          {data.activeConditions.length > 0 ? (
            <div className="space-y-1">
              {data.activeConditions.slice(0, 5).map((c, i) => (
                <ConditionRow key={i} condition={c} />
              ))}
              {data.activeConditions.length > 5 && (
                <p className="text-[10px] text-muted-foreground/40 mt-1">
                  +{data.activeConditions.length - 5} more
                </p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/40">No active conditions recorded</p>
          )}
        </div>

        {/* Past Conditions */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3.5 h-3.5 text-muted-foreground/50" />
            <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Past Conditions</h4>
          </div>
          {data.pastConditions.length > 0 ? (
            <div className="space-y-1">
              {data.pastConditions.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-xs text-muted-foreground">{c.name}</span>
                  <span className="text-[10px] text-muted-foreground/30">
                    {new Date(c.lastRecorded).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </span>
                </div>
              ))}
              {data.pastConditions.length > 5 && (
                <p className="text-[10px] text-muted-foreground/40">+{data.pastConditions.length - 5} more</p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/40">No past conditions recorded</p>
          )}
        </div>

        {/* Allergies */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Allergies</h4>
          </div>
          {data.allergies.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {data.allergies.map((a, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {a}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/40">No allergies recorded</p>
          )}
        </div>

        {/* Current Medications */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <Pill className="w-3.5 h-3.5 text-emerald-400" />
            <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
              Medications {data.currentMedications.length > 0 && `(${data.currentMedications.length})`}
            </h4>
          </div>
          {data.currentMedications.length > 0 ? (
            <div className="space-y-1">
              {(showAllMedications ? data.currentMedications : data.currentMedications.slice(0, 4)).map((m, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <Pill className="w-3 h-3 text-emerald-400/60 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">{m}</span>
                </div>
              ))}
              {data.currentMedications.length > 4 && (
                <button onClick={() => setShowAllMedications(!showAllMedications)}
                  className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1">
                  {showAllMedications ? "Show less" : `Show ${data.currentMedications.length - 4} more`}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAllMedications ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/40">No medications recorded</p>
          )}
        </div>

        {/* Lab History */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
            <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
              Lab History {data.labHistory.length > 0 && `(${data.labHistory.length})`}
            </h4>
          </div>
          {data.labHistory.length > 0 ? (
            <div className="space-y-1">
              {(showAllLabs ? data.labHistory : data.labHistory.slice(0, 4)).map((l, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <FlaskConical className="w-3 h-3 text-cyan-400/60 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">{l}</span>
                </div>
              ))}
              {data.labHistory.length > 4 && (
                <button onClick={() => setShowAllLabs(!showAllLabs)}
                  className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1">
                  {showAllLabs ? "Show less" : `Show ${data.labHistory.length - 4} more`}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAllLabs ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/40">No lab tests recorded</p>
          )}
        </div>

        {/* Imaging History */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <ScanLine className="w-3.5 h-3.5 text-violet-400" />
            <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
              Imaging History {data.imagingHistory.length > 0 && `(${data.imagingHistory.length})`}
            </h4>
          </div>
          {data.imagingHistory.length > 0 ? (
            <div className="space-y-1">
              {(showAllImaging ? data.imagingHistory : data.imagingHistory.slice(0, 4)).map((img, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <ScanLine className="w-3 h-3 text-violet-400/60 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">{img}</span>
                </div>
              ))}
              {data.imagingHistory.length > 4 && (
                <button onClick={() => setShowAllImaging(!showAllImaging)}
                  className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-1">
                  {showAllImaging ? "Show less" : `Show ${data.imagingHistory.length - 4} more`}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAllImaging ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/40">No imaging recorded</p>
          )}
        </div>

        {/* Lifestyle Profile */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-1.5 mb-2">
            <HeartPulse className="w-3.5 h-3.5 text-cyan-400" />
            <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Lifestyle Profile</h4>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {data.lifestyleProfile.smoking ? <Cigarette className="w-3 h-3 text-muted-foreground/50" /> : <Moon className="w-3 h-3 text-muted-foreground/50" />}
              <span className="text-xs text-muted-foreground">
                Smoking: {data.lifestyleProfile.smoking ?? "Not recorded"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Wine className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">
                Alcohol: {data.lifestyleProfile.alcohol ?? "Not recorded"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">
                Exercise: {data.lifestyleProfile.exercise ?? "Not recorded"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[10px] text-muted-foreground/30 text-center">
        Medical history is compiled from your consultation records. Always consult a healthcare professional.
      </p>
    </motion.div>
  );
}

function StatBox({ label, value, icon: Icon, valueColor }: {
  label: string; value: string; icon: React.ElementType; valueColor?: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
      <Icon className="w-3.5 h-3.5 text-muted-foreground/50 mx-auto mb-1" />
      <p className={`text-sm font-bold ${valueColor ?? "text-foreground"}`}>{value}</p>
      <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

function ConditionRow({ condition }: { condition: HistorySummary["activeConditions"][0] }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
        <span className="text-xs text-foreground truncate">{condition.name}</span>
        {condition.count > 1 && (
          <span className="text-[10px] text-muted-foreground/30 flex-shrink-0">×{condition.count}</span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/30 flex-shrink-0 ml-2">
        {new Date(condition.lastRecorded).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    </div>
  );
}
