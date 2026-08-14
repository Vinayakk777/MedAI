import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, User, Stethoscope, CheckCircle, XCircle } from "lucide-react";

export function ReferralManager() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patientUserId: "", specialty: "", reason: "", priority: "routine" });

  const { data: referrals } = useQuery<any[]>({
    queryKey: ["referrals"],
    queryFn: () => fetch("/api/clinician/referrals").then((r) => r.json()),
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => fetch("/api/clinician/referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["referrals"] }); setShowForm(false); setForm({ patientUserId: "", specialty: "", reason: "", priority: "routine" }); },
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      fetch(`/api/clinician/referrals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, responseNotes: notes }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referrals"] }),
  });

  const outbound = referrals?.filter((r) => r.status === "pending") || [];
  const inbound = referrals?.filter((r) => r.status === "accepted" || r.status === "completed") || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <ArrowRight className="w-6 h-6 text-amber-400" />
        <h2 className="text-xl font-bold text-white">Referral Manager</h2>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600">New Referral</button>
      </div>

      {/* Create form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">New Referral</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.patientUserId} onChange={(e) => setForm({ ...form, patientUserId: e.target.value })}
              placeholder="Patient User ID" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            <select value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
              <option value="">Select specialty</option>
              <option value="cardiology">Cardiology</option>
              <option value="neurology">Neurology</option>
              <option value="orthopedics">Orthopedics</option>
              <option value="pediatrics">Pediatrics</option>
              <option value="psychiatry">Psychiatry</option>
              <option value="dermatology">Dermatology</option>
              <option value="radiology">Radiology</option>
              <option value="general_surgery">General Surgery</option>
            </select>
          </div>
          <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="Reason for referral" rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate(form)} disabled={!form.patientUserId || !form.specialty || createMutation.isPending}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 disabled:opacity-50">Submit Referral</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white/10 text-muted-foreground rounded-lg text-sm">Cancel</button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outbound */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Pending Referrals ({outbound.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {outbound.map((r: any) => (
              <ReferralCard key={r.id} referral={r} />
            ))}
            {outbound.length === 0 && <p className="text-xs text-muted-foreground">No pending referrals.</p>}
          </div>
        </div>

        {/* Inbound / History */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Referral History</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {inbound.map((r: any) => (
              <ReferralCard key={r.id} referral={r} />
            ))}
            {inbound.length === 0 && <p className="text-xs text-muted-foreground">No referral history.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReferralCard({ referral }: { referral: any }) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-white font-medium capitalize">{referral.specialty?.replace(/_/g, " ")}</span>
        <PriorityBadge priority={referral.priority} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
        <span className="flex items-center gap-1"><User className="w-3 h-3" />{referral.patientUserId?.slice(0, 12)}</span>
        <span className="flex items-center gap-1"><Stethoscope className="w-3 h-3" />{referral.requestingClinicianId?.slice(0, 12)}</span>
      </div>
      {referral.reason && <p className="text-xs text-white/70 mb-1">{referral.reason}</p>}
      <p className="text-xs text-muted-foreground">{new Date(referral.createdAt).toLocaleString()}</p>
      <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-muted-foreground">{referral.status}</span>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    emergency: "bg-red-500/20 text-red-300",
    urgent: "bg-amber-500/20 text-amber-300",
    routine: "bg-blue-500/20 text-blue-300",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${styles[priority] || styles.routine}`}>{priority}</span>;
}
