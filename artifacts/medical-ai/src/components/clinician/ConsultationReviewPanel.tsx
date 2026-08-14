import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Brain, CheckCircle, XCircle, Edit3, FileText, AlertTriangle, ThumbsUp, ThumbsDown } from "lucide-react";

export function ConsultationReviewPanel() {
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [clinicianNotes, setClinicianNotes] = useState("");
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [activeAction, setActiveAction] = useState<"accept" | "reject" | "modify" | null>(null);
  const qc = useQueryClient();

  const { data: pending } = useQuery<any[]>({
    queryKey: ["pending-consultations"],
    queryFn: () => fetch("/api/clinician/consultations/pending").then((r) => r.json()),
    refetchInterval: 15_000,
  });

  const reviewMutation = useMutation({
    mutationFn: (data: { reviewId: string; body: any }) =>
      fetch(`/api/clinician/consultations/review/${data.reviewId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data.body),
      }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pending-consultations"] }); setActiveAction(null); setClinicianNotes(""); setFinalDiagnosis(""); },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Brain className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">AI Consultation Review</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending list */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Pending Reviews ({pending?.length ?? 0})</h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {pending?.map((r: any) => (
              <button key={r.id} onClick={() => { setSelectedReview(r.id); setActiveAction(null); }}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedReview === r.id ? "bg-cyan-500/10 border-cyan-500/30" : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm text-white font-medium">Consultation</span>
                </div>
                <p className="text-xs text-muted-foreground">Patient: {r.patientUserId?.slice(0, 12)}</p>
                <p className="text-xs text-muted-foreground">Confidence: {r.aiConfidenceScore != null ? `${Math.round(r.aiConfidenceScore)}%` : "N/A"}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
              </button>
            ))}
            {(!pending || pending.length === 0) && <p className="text-xs text-muted-foreground p-3">No pending reviews.</p>}
          </div>
        </div>

        {/* Review panel */}
        <div className="lg:col-span-2 space-y-4">
          {selectedReview ? (
            <>
              {pending?.filter((r) => r.id === selectedReview).map((review) => (
                <motion.div key={review.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                  
                  {/* AI Summary */}
                  <div>
                    <h4 className="text-sm font-semibold text-cyan-400 mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4" /> AI Summary
                    </h4>
                    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg p-3">
                      <p className="text-sm text-white/80">{review.aiSummary || "No summary generated"}</p>
                    </div>
                  </div>

                  {/* AI Differential Diagnoses */}
                  {review.aiDifferentialDiagnoses && (
                    <div>
                      <h4 className="text-sm font-semibold text-amber-400 mb-2">AI Differential Diagnoses</h4>
                      <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                        <pre className="text-xs text-white/70 whitespace-pre-wrap">{JSON.stringify(review.aiDifferentialDiagnoses, null, 2)}</pre>
                      </div>
                    </div>
                  )}

                  {/* Confidence */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className="text-white font-semibold">{review.aiConfidenceScore != null ? `${Math.round(review.aiConfidenceScore)}%` : "N/A"}</span>
                    </div>
                  </div>

                  {/* AI-generated tag */}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    AI-generated content — advisory only. All clinical decisions must be made by a licensed physician.
                  </div>

                  {/* Clinician action */}
                  <div className="flex items-center gap-3">
                    <button onClick={() => setActiveAction("accept")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${activeAction === "accept" ? "bg-emerald-500 text-white" : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"}`}>
                      <CheckCircle className="w-4 h-4" /> Accept
                    </button>
                    <button onClick={() => setActiveAction("reject")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${activeAction === "reject" ? "bg-red-500 text-white" : "bg-red-500/20 text-red-300 hover:bg-red-500/30"}`}>
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                    <button onClick={() => setActiveAction("modify")}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${activeAction === "modify" ? "bg-amber-500 text-white" : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"}`}>
                      <Edit3 className="w-4 h-4" /> Modify
                    </button>
                  </div>

                  {/* Action form */}
                  {activeAction && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="bg-white/[0.03] border border-white/10 rounded-lg p-4 space-y-3">
                      <h4 className="text-sm font-medium text-white">
                        {activeAction === "accept" ? "Accept AI Recommendations" :
                         activeAction === "reject" ? "Reject AI Recommendations" : "Modify AI Recommendations"}
                      </h4>
                      <input value={finalDiagnosis} onChange={(e) => setFinalDiagnosis(e.target.value)}
                        placeholder="Final diagnosis (optional)" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                      <textarea value={clinicianNotes} onChange={(e) => setClinicianNotes(e.target.value)}
                        placeholder="Clinician notes / corrections..." rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                      <div className="flex gap-2">
                        <button onClick={() => reviewMutation.mutate({
                          reviewId: review.id,
                          body: {
                            reviewStatus: activeAction,
                            clinicianNotes,
                            finalDiagnosis: finalDiagnosis || undefined,
                          },
                        })} disabled={reviewMutation.isPending}
                          className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 disabled:opacity-50">
                          Submit Review
                        </button>
                        <button onClick={() => setActiveAction(null)}
                          className="px-4 py-2 bg-white/10 text-muted-foreground rounded-lg text-sm hover:bg-white/20">
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-muted-foreground">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a pending consultation to review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
