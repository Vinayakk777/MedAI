import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Calendar, Activity, FileText, Stethoscope, AlertTriangle, ArrowRight } from "lucide-react";

interface TimelineEvent {
  id: string;
  type: "consultation" | "note" | "careplan" | "referral" | "alert" | "fhir_export";
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export function MedicalTimeline() {
  const [patientUserId, setPatientUserId] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");

  const { data: timeline } = useQuery<TimelineEvent[]>({
    queryKey: ["medical-timeline", patientUserId],
    queryFn: () => fetch(`/api/clinician/patients/${patientUserId}/timeline`).then((r) => r.json()),
    enabled: !!patientUserId,
  });

  const filtered = timeline?.filter((e) => eventFilter === "all" || e.type === eventFilter) || [];

  const eventIcons: Record<string, React.ReactNode> = {
    consultation: <Stethoscope className="w-4 h-4 text-cyan-400" />,
    note: <FileText className="w-4 h-4 text-emerald-400" />,
    careplan: <Activity className="w-4 h-4 text-blue-400" />,
    referral: <ArrowRight className="w-4 h-4 text-amber-400" />,
    alert: <AlertTriangle className="w-4 h-4 text-rose-400" />,
    fhir_export: <Calendar className="w-4 h-4 text-purple-400" />,
  };

  const eventColors: Record<string, string> = {
    consultation: "border-cyan-500/30",
    note: "border-emerald-500/30",
    careplan: "border-blue-500/30",
    referral: "border-amber-500/30",
    alert: "border-rose-500/30",
    fhir_export: "border-purple-500/30",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Calendar className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Medical Timeline</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <input value={patientUserId} onChange={(e) => setPatientUserId(e.target.value)}
              placeholder="Enter Patient User ID" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>

          {/* Filter */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">Filter by type</p>
            {["all", "consultation", "note", "careplan", "referral", "alert", "fhir_export"].map((t) => (
              <button key={t} onClick={() => setEventFilter(t)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors capitalize ${eventFilter === t ? "bg-cyan-500/10 text-cyan-300" : "text-muted-foreground hover:text-white"}`}>
                {t === "all" ? "All Events" : t.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {/* Stats */}
          {timeline && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Event Count</p>
              {["consultation", "note", "careplan", "referral", "alert"].map((t) => {
                const count = timeline.filter((e) => e.type === t).length;
                if (count === 0) return null;
                return (
                  <div key={t} className="flex items-center justify-between text-xs">
                    <span className="text-white/70 capitalize">{t.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-3 space-y-4">
          {patientUserId ? (
            filtered.length > 0 ? (
              <div className="relative pl-6 space-y-0">
                {/* Vertical line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/10" />

                {filtered.map((event, idx) => (
                  <motion.div key={event.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
                    className={`relative pb-4 pl-6 border-l-2 ${eventColors[event.type] || "border-white/10"}`}
                    style={{ borderLeftColor: undefined, borderLeftWidth: 0 }}>
                    {/* Dot */}
                    <div className="absolute -left-[17px] top-0 w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      {eventIcons[event.type] || <Calendar className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    {/* Content */}
                    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3 ml-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">{event.title}</span>
                        <span className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</span>
                      </div>
                      {event.description && <p className="text-xs text-muted-foreground">{event.description}</p>}
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <div className="mt-2 flex gap-2 flex-wrap">
                          {Object.entries(event.metadata).map(([k, v]) => (
                            <span key={k} className="text-xs bg-white/5 px-2 py-0.5 rounded text-muted-foreground">
                              {k}: {String(v).slice(0, 30)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No timeline events found for this patient</p>
              </div>
            )
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Enter a Patient User ID to view their medical timeline</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
