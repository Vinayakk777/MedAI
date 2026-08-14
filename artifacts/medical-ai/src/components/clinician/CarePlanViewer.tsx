import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, Plus, CheckCircle, Clock, AlertTriangle, User } from "lucide-react";

export function CarePlanViewer() {
  const qc = useQueryClient();
  const [patientUserId, setPatientUserId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", goals: "", interventions: "" });

  const { data: plans } = useQuery<any[]>({
    queryKey: ["care-plans", patientUserId],
    queryFn: () => fetch(`/api/clinician/patients/${patientUserId}/care-plans`).then((r) => r.json()),
    enabled: !!patientUserId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => fetch("/api/clinician/care-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["care-plans"] }); setShowForm(false); setForm({ title: "", description: "", goals: "", interventions: "" }); },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => fetch(`/api/clinician/care-plans/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["care-plans"] }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="w-6 h-6 text-emerald-400" />
        <h2 className="text-xl font-bold text-white">Care Plans</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <input value={patientUserId} onChange={(e) => setPatientUserId(e.target.value)}
            placeholder="Enter Patient User ID" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-4" />
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {plans?.map((p: any) => (
              <div key={p.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-white font-medium truncate">{p.title}</p>
                  <StatusBadge status={p.status} />
                </div>
                {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{new Date(p.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
            {patientUserId && (!plans || plans.length === 0) && <p className="text-xs text-muted-foreground">No care plans.</p>}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {showForm ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">New Care Plan</h3>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Care plan title" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description" rows={2} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <textarea value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })}
                placeholder="Treatment goals (one per line)" rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <textarea value={form.interventions} onChange={(e) => setForm({ ...form, interventions: e.target.value })}
                placeholder="Interventions (one per line)" rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <div className="flex gap-2">
                <button onClick={() => createMutation.mutate({ ...form, patientUserId })} disabled={!form.title || createMutation.isPending}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 disabled:opacity-50">
                  Create Plan
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-white/10 text-muted-foreground rounded-lg text-sm">Cancel</button>
              </div>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  {patientUserId ? `Care Plans for Patient ${patientUserId.slice(0, 12)}` : "Patient Care Plans"}
                </h3>
                <button onClick={() => setShowForm(true)} disabled={!patientUserId}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm hover:bg-emerald-500/30 disabled:opacity-50">
                  <Plus className="w-4 h-4" /> New Plan
                </button>
              </div>
              {plans?.filter((p) => p.status === "active").map((plan: any) => (
                <motion.div key={plan.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-semibold">{plan.title}</h4>
                    <div className="flex gap-2">
                      <button onClick={() => updateStatusMutation.mutate({ id: plan.id, status: "completed" })}
                        className="text-xs text-emerald-400 hover:underline">Complete</button>
                      <button onClick={() => updateStatusMutation.mutate({ id: plan.id, status: "cancelled" })}
                        className="text-xs text-red-400 hover:underline">Cancel</button>
                    </div>
                  </div>
                  {plan.description && <p className="text-sm text-white/70">{plan.description}</p>}
                  {plan.goals && (
                    <div>
                      <p className="text-xs font-medium text-emerald-400 mb-1">Goals</p>
                      <ul className="list-disc list-inside text-xs text-white/70 space-y-0.5">
                        {plan.goals.split("\n").filter(Boolean).map((g: string, i: number) => <li key={i}>{g}</li>)}
                      </ul>
                    </div>
                  )}
                  {plan.interventions && (
                    <div>
                      <p className="text-xs font-medium text-cyan-400 mb-1">Interventions</p>
                      <ul className="list-disc list-inside text-xs text-white/70 space-y-0.5">
                        {plan.interventions.split("\n").filter(Boolean).map((iv: string, i: number) => <li key={i}>{iv}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Created {new Date(plan.createdAt).toLocaleDateString()}</span>
                    {plan.startedAt && <span>Started {new Date(plan.startedAt).toLocaleDateString()}</span>}
                    {plan.completedAt && <span>Completed {new Date(plan.completedAt).toLocaleDateString()}</span>}
                  </div>
                </motion.div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-300",
    completed: "bg-blue-500/20 text-blue-300",
    cancelled: "bg-red-500/20 text-red-300",
    draft: "bg-white/10 text-muted-foreground",
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${styles[status] || styles.draft}`}>{status}</span>;
}
