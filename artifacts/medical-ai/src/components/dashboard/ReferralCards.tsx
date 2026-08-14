import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, Clock, FileText, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, Archive, Download,
  Info, MapPin, Phone, Star, ExternalLink,
} from "lucide-react";

type HandoffSummaryData = {
  patientInfo: { age?: string; sex?: string; height?: string; weight?: string; bmi?: string };
  chiefComplaint: string;
  historyOfPresentIllness: { timeline: string; duration: string; severity: string; progression: string };
  relevantMedicalHistory: string[];
  currentMedications: string[];
  allergies: string[];
  vitalSigns: Record<string, number | string | null>;
  differentialDiagnoses: Array<{ condition: string; confidence: string; supportingSymptoms: string[] }>;
  riskAssessment: { overallScore: number | null; riskCategory: string | null; emergencyFlags: string[]; redFlags: Array<{ category: string; flag: string }> };
  recommendedInvestigations: Array<{ testName: string; reason: string; priority: string }>;
  redFlagFindings: string[];
  aiClinicalSummary: string;
  followUpAlreadyAttempted: string[];
  outstandingQuestions: string[];
  previousConsultations: Array<{ date: string; chiefComplaint: string | null; outcome: string | null }>;
  disclaimer: string;
  generatedAt: string;
};

type ReferralRow = {
  id: string;
  conversationId: string;
  careLevel: string;
  urgencyLabel: string;
  urgencyReason: string;
  estimatedSeekTime: string;
  preparationInstructions: string[];
  whatToBring: string[];
  whatToTellDoctor: string[];
  handoffSummary: HandoffSummaryData | null;
  status: string;
  followUpOutcome: string | null;
  followUpNotes: string | null;
  createdAt: string;
};

const careLevelConfig: Record<string, { color: string; bg: string; border: string; icon: typeof ShieldAlert }> = {
  self_care:       { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle },
  pcp:             { color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    icon: FileText },
  urgent_care:     { color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  icon: Clock },
  emergency_today: { color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    icon: AlertTriangle },
  emergency_now:   { color: "text-red-400",     bg: "bg-red-500/15",     border: "border-red-500/30",     icon: ShieldAlert },
};

const levelOrder = ["emergency_now", "emergency_today", "urgent_care", "pcp", "self_care"];

export function ReferralCards() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewingHandoff, setViewingHandoff] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<ReferralRow[]>({
    queryKey: ["referrals"],
    queryFn: () => fetch("/api/referrals").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/referrals/${id}/archive`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referrals"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; followUpOutcome?: string; followUpNotes?: string }) =>
      fetch(`/api/referrals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["referrals"] }),
  });

  const records = (data ?? []).sort((a, b) => {
    const aIdx = levelOrder.indexOf(a.careLevel);
    const bIdx = levelOrder.indexOf(b.careLevel);
    return aIdx - bIdx || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (isLoading) {
    return <LoadingState />;
  }
  if (error) {
    return <ErrorState />;
  }
  if (records.length === 0) {
    return <EmptyState />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">

      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Care Referrals</h3>
        <span className="text-[10px] text-muted-foreground/40 bg-white/5 px-1.5 py-0.5 rounded-md">{records.length}</span>
      </div>

      <div className="space-y-3">
        {records.map((ref) => {
          const cfg = careLevelConfig[ref.careLevel] ?? careLevelConfig.self_care;
          const Icon = cfg.icon;
          const isExpanded = expandedId === ref.id;

          return (
            <motion.div key={ref.id} layout
              className={`rounded-xl border ${cfg.border} ${cfg.bg}/30 overflow-hidden`}>

              <button onClick={() => setExpandedId(isExpanded ? null : ref.id)}
                className="w-full text-left p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={`p-1.5 rounded-lg ${cfg.bg} ${cfg.border}`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{ref.urgencyLabel}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ref.status === "active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-muted-foreground border-white/10"}`}>
                          {ref.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {new Date(ref.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {ref.estimatedSeekTime && ` · ${ref.estimatedSeekTime}`}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-white/5">
                    <div className="p-3 sm:p-4 space-y-3">

                      {/* Reason */}
                      <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1">Why this recommendation?</p>
                        <p className="text-xs text-foreground leading-relaxed">{ref.urgencyReason}</p>
                      </div>

                      {/* Preparation */}
                      {ref.preparationInstructions.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">Preparation</p>
                          <ul className="space-y-1">
                            {ref.preparationInstructions.map((pi, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <span className="text-primary/50 mt-0.5">•</span>
                                {pi}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* What to bring */}
                      {ref.whatToBring.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">What to Bring</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ref.whatToBring.map((item, i) => (
                              <span key={i} className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-muted-foreground">
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* What to tell doctor */}
                      {ref.whatToTellDoctor.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">What to Tell the Doctor</p>
                          <ul className="space-y-1">
                            {ref.whatToTellDoctor.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <span className="text-primary/50 mt-0.5">•</span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Handoff Summary */}
                      {ref.handoffSummary && (
                        <button onClick={() => setViewingHandoff(ref.id)}
                          className="w-full flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-xs text-foreground">View Doctor Handoff Summary</span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
                        </button>
                      )}

                      {/* Follow-up outcome */}
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
                        <select
                          value={ref.status}
                          onChange={(e) => updateMutation.mutate({ id: ref.id, status: e.target.value })}
                          className="text-[10px] px-2 py-1.5 rounded-lg bg-background border border-white/10 text-muted-foreground focus:outline-none focus:border-primary/40"
                        >
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                          <option value="declined">Declined</option>
                          <option value="expired">Expired</option>
                        </select>
                        <input
                          type="text" placeholder="Outcome note..."
                          value={ref.followUpNotes ?? ""}
                          onChange={(e) => updateMutation.mutate({ id: ref.id, followUpNotes: e.target.value })}
                          className="flex-1 min-w-[120px] text-[10px] px-2 py-1.5 rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40"
                        />
                        <button onClick={() => archiveMutation.mutate(ref.id)}
                          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-white/5 transition-colors">
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Handoff Modal */}
      <AnimatePresence>
        {viewingHandoff && (
          <HandoffModal
            referral={records.find((r) => r.id === viewingHandoff)!}
            onClose={() => setViewingHandoff(null)}
          />
        )}
      </AnimatePresence>

      <p className="mt-4 text-[10px] text-muted-foreground/30 text-center">
        Referral recommendations are advisory. Final medical decisions belong to licensed healthcare professionals.
      </p>
    </motion.div>
  );
}

function HandoffModal({ referral, onClose }: { referral: ReferralRow; onClose: () => void }) {
  const h = referral.handoffSummary;
  if (!h) return null;

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Doctor Handoff Summary</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #222; line-height: 1.6; }
          h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
          h2 { font-size: 14px; margin-top: 20px; color: #555; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          p, li { font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: center; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
          .critical { background: #fee; color: #c00; }
          .moderate { background: #ffe; color: #c80; }
          .low { background: #efe; color: #0a0; }
          .disclaimer { margin-top: 30px; padding: 12px; background: #f5f5f5; border-left: 3px solid #999; font-size: 11px; color: #666; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          td, th { padding: 6px 8px; border: 1px solid #ddd; text-align: left; }
          th { background: #f0f0f0; }
        </style>
      </head><body>
        <div class="header">
          <h1>Doctor Handoff Summary</h1>
          <p>${new Date(h.generatedAt).toLocaleString()}</p>
        </div>
        <p><strong>Urgency:</strong> ${referral.urgencyLabel}</p>
        <p><strong>Reason:</strong> ${referral.urgencyReason}</p>
        <h2>Patient Information</h2>
        <p>${[h.patientInfo.age && `Age: ${h.patientInfo.age}`, h.patientInfo.sex && `Sex: ${h.patientInfo.sex}`, h.patientInfo.height && `Ht: ${h.patientInfo.height}`, h.patientInfo.weight && `Wt: ${h.patientInfo.weight}`].filter(Boolean).join(" | ")}</p>
        <h2>Chief Complaint</h2>
        <p>${h.chiefComplaint}</p>
        <h2>History of Present Illness</h2>
        <p><strong>Duration:</strong> ${h.historyOfPresentIllness.duration} | <strong>Severity:</strong> ${h.historyOfPresentIllness.severity} | <strong>Progression:</strong> ${h.historyOfPresentIllness.progression}</p>
        <p>${h.historyOfPresentIllness.timeline}</p>
        ${h.relevantMedicalHistory.length ? `<h2>Medical History</h2><p>${h.relevantMedicalHistory.join(", ")}</p>` : ""}
        ${h.currentMedications.length ? `<h2>Current Medications</h2><p>${h.currentMedications.join(", ")}</p>` : ""}
        ${h.allergies.length ? `<h2>Allergies</h2><p>${h.allergies.join(", ")}</p>` : ""}
        ${h.vitalSigns && Object.values(h.vitalSigns).some(v => v != null) ? `<h2>Vital Signs</h2><table><tr>${Object.entries(h.vitalSigns).filter(([_, v]) => v != null).map(([k, v]) => `<th>${k}</th>`).join("")}</tr><tr>${Object.entries(h.vitalSigns).filter(([_, v]) => v != null).map(([_, v]) => `<td>${v}</td>`).join("")}</tr></table>` : ""}
        <h2>Differential Diagnoses</h2>
        <ul>${h.differentialDiagnoses.map(d => `<li>${d.condition} (${d.confidence}% confidence)${d.supportingSymptoms.length ? ` — supporting: ${d.supportingSymptoms.join(", ")}` : ""}</li>`).join("")}</ul>
        <h2>Risk Assessment</h2>
        <p>Score: ${h.riskAssessment.overallScore ?? "N/A"}/100 (${h.riskAssessment.riskCategory ?? "N/A"})</p>
        ${h.redFlagFindings.length ? `<p><strong>Red Flags:</strong> ${h.redFlagFindings.join("; ")}</p>` : ""}
        ${h.recommendedInvestigations.length ? `<h2>Recommended Investigations</h2><ul>${h.recommendedInvestigations.map(i => `<li>${i.testName} (${i.priority}) — ${i.reason}</li>`).join("")}</ul>` : ""}
        <h2>AI Clinical Summary</h2>
        <p>${h.aiClinicalSummary}</p>
        ${h.outstandingQuestions.length ? `<h2>Outstanding Questions</h2><ul>${h.outstandingQuestions.map(q => `<li>${q}</li>`).join("")}</ul>` : ""}
        ${h.previousConsultations.length ? `<h2>Previous Consultations</h2><ul>${h.previousConsultations.map(pc => `<li>${new Date(pc.date).toLocaleDateString()}: ${pc.chiefComplaint ?? "N/A"} — ${pc.outcome ?? "N/A"}</li>`).join("")}</ul>` : ""}
        <div class="disclaimer">${h.disclaimer}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-card border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        <div className="sticky top-0 bg-card/90 backdrop-blur-md border-b border-white/5 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-foreground">Doctor Handoff Summary</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handlePrint}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-white/5 border border-white/10 transition-all">
              <Download className="w-3 h-3" /> Print
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-white/5 transition-all">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4 text-xs text-foreground">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/5">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span className="text-xs font-semibold">{referral.urgencyLabel}</span>
            <span className="text-[10px] text-muted-foreground/50 ml-auto">{referral.estimatedSeekTime}</span>
          </div>

          <p className="text-muted-foreground leading-relaxed">{referral.urgencyReason}</p>

          {/* Patient Info */}
          <Section title="Patient Information" icon={Info}>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {h.patientInfo.age && <span>Age: {h.patientInfo.age}</span>}
              {h.patientInfo.sex && <span>Sex: {h.patientInfo.sex}</span>}
              {h.patientInfo.height && <span>Height: {h.patientInfo.height}</span>}
              {h.patientInfo.weight && <span>Weight: {h.patientInfo.weight}</span>}
            </div>
          </Section>

          <Section title="Chief Complaint" icon={FileText}>
            <p className="text-foreground">{h.chiefComplaint}</p>
          </Section>

          <Section title="History of Present Illness" icon={Clock}>
            <div className="space-y-1 text-muted-foreground">
              <p>Duration: {h.historyOfPresentIllness.duration} | Severity: {h.historyOfPresentIllness.severity} | Progression: {h.historyOfPresentIllness.progression}</p>
              <p className="text-xs">{h.historyOfPresentIllness.timeline}</p>
            </div>
          </Section>

          {h.relevantMedicalHistory.length > 0 && (
            <Section title="Medical History" icon={Info}>
              <p className="text-muted-foreground">{h.relevantMedicalHistory.join(", ")}</p>
            </Section>
          )}

          {h.currentMedications.length > 0 && (
            <Section title="Current Medications" icon={FileText}>
              <p className="text-muted-foreground">{h.currentMedications.join(", ")}</p>
            </Section>
          )}

          {h.allergies.length > 0 && (
            <Section title="Allergies" icon={ShieldAlert}>
              <div className="flex flex-wrap gap-1">
                {h.allergies.map((a, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">{a}</span>
                ))}
              </div>
            </Section>
          )}

          <Section title="Differential Diagnoses" icon={FileText}>
            <div className="space-y-1">
              {h.differentialDiagnoses.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                  <span className="text-xs text-foreground">{d.condition}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${d.confidence === "High" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : d.confidence === "Moderate" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                    {d.confidence}%
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Risk Assessment" icon={ShieldAlert}>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                <p className="text-[10px] text-muted-foreground/50">Score</p>
                <p className={`text-sm font-bold ${(h.riskAssessment.overallScore ?? 0) >= 70 ? "text-rose-400" : (h.riskAssessment.overallScore ?? 0) >= 40 ? "text-amber-400" : "text-emerald-400"}`}>
                  {h.riskAssessment.overallScore ?? "N/A"}/100
                </p>
              </div>
              <div className="p-2 rounded-lg bg-white/5 border border-white/5">
                <p className="text-[10px] text-muted-foreground/50">Category</p>
                <p className="text-sm font-bold text-foreground">{h.riskAssessment.riskCategory ?? "N/A"}</p>
              </div>
            </div>
            {h.redFlagFindings.length > 0 && (
              <div className="mt-2 space-y-1">
                {h.redFlagFindings.map((rf, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                    <span className="text-xs text-rose-300">{rf}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {h.recommendedInvestigations.length > 0 && (
            <Section title="Recommended Investigations" icon={FileText}>
              <div className="space-y-1">
                {h.recommendedInvestigations.map((inv, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-xs text-foreground">{inv.testName}</span>
                    <span className="text-[10px] text-muted-foreground/50">{inv.priority}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="AI Clinical Summary" icon={FileText}>
            <p className="text-muted-foreground leading-relaxed">{h.aiClinicalSummary}</p>
          </Section>

          {h.outstandingQuestions.length > 0 && (
            <Section title="Outstanding Questions" icon={Info}>
              <ul className="space-y-1">
                {h.outstandingQuestions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary/50 mt-0.5">•</span>
                    {q}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {h.previousConsultations.length > 0 && (
            <Section title="Previous Consultations" icon={Clock}>
              <div className="space-y-1">
                {h.previousConsultations.map((pc, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                    <span className="text-xs text-muted-foreground">{new Date(pc.date).toLocaleDateString()}</span>
                    <span className="text-xs text-foreground">{pc.chiefComplaint ?? "N/A"}</span>
                    <span className="text-[10px] text-muted-foreground/50">{pc.outcome ?? "N/A"}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
            <p className="text-[10px] text-amber-400/80 leading-relaxed">{h.disclaimer}</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3 h-3 text-primary/60" />
        <h4 className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wider">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldAlert className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Care Referrals</h3>
      </div>
      <div className="space-y-2 animate-pulse">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-white/5 p-4">
            <div className="h-4 w-48 bg-white/5 rounded mb-2" />
            <div className="h-3 w-32 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ErrorState() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-rose-500/15 bg-rose-500/5 backdrop-blur-sm p-6">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-rose-400" />
        <h3 className="text-sm font-semibold text-foreground">Unable to Load Referrals</h3>
      </div>
      <p className="text-xs text-muted-foreground">Failed to fetch referral data. Please try again later.</p>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Care Referrals</h3>
      </div>
      <p className="text-xs text-muted-foreground/60 mt-2">
        No referrals yet. Complete a consultation to generate a care recommendation and doctor handoff summary.
      </p>
    </motion.div>
  );
}
