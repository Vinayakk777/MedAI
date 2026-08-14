import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileText, Save, CheckCircle, Plus } from "lucide-react";

export function PhysicianNoteEditor() {
  const qc = useQueryClient();
  const [patientUserId, setPatientUserId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subjective: "", objective: "", assessment: "", plan: "", consultationId: "" });

  const createMutation = useMutation({
    mutationFn: (data: any) => fetch("/api/clinician/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["patient-notes"] }); setShowForm(false); setForm({ subjective: "", objective: "", assessment: "", plan: "", consultationId: "" }); },
  });

  const finalizeMutation = useMutation({
    mutationFn: (noteId: string) => fetch(`/api/clinician/notes/${noteId}/finalize`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient-notes"] }),
  });

  const { data: notes } = useQuery<any[]>({
    queryKey: ["patient-notes", patientUserId],
    queryFn: () => fetch(`/api/clinician/notes/patient/${patientUserId}`).then((r) => r.json()),
    enabled: !!patientUserId,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <FileText className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Physician Notes (SOAP)</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient selector + note list */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <input value={patientUserId} onChange={(e) => setPatientUserId(e.target.value)}
            placeholder="Enter Patient User ID" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-4" />
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {notes?.map((n: any) => (
              <div key={n.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">v{n.version}</span>
                  {n.isFinalized ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <button onClick={() => finalizeMutation.mutate(n.id)} className="text-xs text-cyan-400 hover:underline">Finalize</button>}
                </div>
                <p className="text-xs text-white/70 truncate">{n.subjective?.slice(0, 80) || "No content"}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
            {patientUserId && (!notes || notes.length === 0) && <p className="text-xs text-muted-foreground">No notes yet.</p>}
          </div>
        </div>

        {/* SOAP editor */}
        <div className="lg:col-span-2">
          {showForm ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">New SOAP Note</h3>
              <SOAPField label="Subjective" value={form.subjective} onChange={(v) => setForm({ ...form, subjective: v })} placeholder="Patient's reported symptoms, history, concerns..." />
              <SOAPField label="Objective" value={form.objective} onChange={(v) => setForm({ ...form, objective: v })} placeholder="Vitals, exam findings, lab results..." />
              <SOAPField label="Assessment" value={form.assessment} onChange={(v) => setForm({ ...form, assessment: v })} placeholder="Diagnosis, differential, clinical reasoning..." />
              <SOAPField label="Plan" value={form.plan} onChange={(v) => setForm({ ...form, plan: v })} placeholder="Treatment plan, medications, follow-up, referrals..." />
              <div className="flex gap-2">
                <button onClick={() => createMutation.mutate({ ...form, patientUserId })} disabled={!form.subjective || createMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 disabled:opacity-50">
                  <Save className="w-4 h-4" /> Save Note
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white/10 text-muted-foreground rounded-lg text-sm">Cancel</button>
              </div>
            </motion.div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">SOAP Format Documentation</h3>
                <button onClick={() => setShowForm(true)} disabled={!patientUserId}
                  className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/30 disabled:opacity-50">
                  <Plus className="w-4 h-4" /> New Note
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-lg p-3">
                  <span className="text-cyan-400 font-bold">S</span>ubjective — Patient-reported symptoms, history, concerns
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3">
                  <span className="text-emerald-400 font-bold">O</span>bjective — Vitals, exam findings, lab results
                </div>
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                  <span className="text-amber-400 font-bold">A</span>ssessment — Diagnosis, differential, clinical reasoning
                </div>
                <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-3">
                  <span className="text-purple-400 font-bold">P</span>lan — Treatment, medications, follow-up, referrals
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SOAPField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-cyan-400 mb-1">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
    </div>
  );
}
