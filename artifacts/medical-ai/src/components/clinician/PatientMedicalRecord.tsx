import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, User, FileText, Brain, Activity, Calendar } from "lucide-react";

export function PatientMedicalRecord() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);

  const { data: patients } = useQuery<any[]>({
    queryKey: ["clinician-patients"],
    queryFn: () => fetch("/api/clinician/patients").then((r) => r.json()),
  });

  const { data: record, isLoading: recordLoading } = useQuery<any>({
    queryKey: ["patient-record", selectedPatient],
    queryFn: () => fetch(`/api/clinician/patients/${selectedPatient}/record`).then((r) => r.json()),
    enabled: !!selectedPatient,
  });

  const filteredPatients = patients?.filter((p: any) =>
    p.patientUserId?.toLowerCase().includes(searchQuery.toLowerCase()),
  ) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <User className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">Patient Medical Record</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient list */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patients..." className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm" />
          </div>
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {filteredPatients.map((p: any) => (
              <button key={p.patientUserId || p.assignment?.id} onClick={() => setSelectedPatient(p.patientUserId)}
                className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${selectedPatient === p.patientUserId ? "bg-cyan-500/10 text-cyan-300" : "text-white/70 hover:bg-white/[0.05]"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">
                    {(p.patientUserId || "??").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm text-white">Patient {(p.patientUserId || "").slice(0, 12)}</p>
                    <p className="text-xs text-muted-foreground">{p.assignment?.relationship || "assigned"}</p>
                  </div>
                </div>
              </button>
            ))}
            {filteredPatients.length === 0 && <p className="text-xs text-muted-foreground p-3">No patients found</p>}
          </div>
        </div>

        {/* Medical record */}
        <div className="lg:col-span-2 space-y-4">
          {selectedPatient ? (
            recordLoading ? <p className="text-muted-foreground">Loading record...</p> :
            <RecordView record={record} patientUserId={selectedPatient} />
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-muted-foreground">
              <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a patient to view their medical record</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordView({ record, patientUserId }: { record: any; patientUserId: string }) {
  const [activeTab, setActiveTab] = useState("consultations");

  const tabs = [
    { id: "consultations", label: "Consultations", icon: <Brain className="w-4 h-4" /> },
    { id: "notes", label: "Physician Notes", icon: <FileText className="w-4 h-4" /> },
    { id: "careplans", label: "Care Plans", icon: <Activity className="w-4 h-4" /> },
    { id: "consent", label: "Consent", icon: <Calendar className="w-4 h-4" /> },
  ];

  return (
    <>
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold">
            {patientUserId.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 className="text-white font-semibold">Patient Record</h3>
            <p className="text-xs text-muted-foreground">ID: {patientUserId}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 pb-2 mb-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? "bg-cyan-500/20 text-cyan-300" : "text-muted-foreground hover:text-white"}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "consultations" && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {record?.consultations?.map((c: any) => (
              <div key={c.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-white font-medium">{c.chiefComplaint || "Consultation"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${c.riskLevel === "emergency" ? "bg-red-500/20 text-red-300" : c.riskLevel === "high" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                    {c.riskLevel || "unknown"}
                  </span>
                </div>
              </div>
            ))}
            {(!record?.consultations || record.consultations.length === 0) && <p className="text-xs text-muted-foreground">No consultations found.</p>}
          </div>
        )}

        {activeTab === "notes" && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {record?.physicianNotes?.map((n: any) => (
              <div key={n.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-muted-foreground">v{n.version} — {new Date(n.createdAt).toLocaleDateString()}</span>
                  {n.isFinalized && <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Finalized</span>}
                </div>
                {n.subjective && <p className="text-xs text-white/70 mb-1"><span className="text-cyan-400">S:</span> {n.subjective.slice(0, 120)}</p>}
                {n.assessment && <p className="text-xs text-white/70"><span className="text-cyan-400">A:</span> {n.assessment.slice(0, 120)}</p>}
              </div>
            ))}
            {(!record?.physicianNotes || record.physicianNotes.length === 0) && <p className="text-xs text-muted-foreground">No physician notes.</p>}
          </div>
        )}

        {activeTab === "careplans" && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {record?.carePlans?.map((p: any) => (
              <div key={p.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-white font-medium">{p.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${p.status === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-muted-foreground"}`}>{p.status}</span>
                </div>
                {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">Started {new Date(p.startedAt || p.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
            {(!record?.carePlans || record.carePlans.length === 0) && <p className="text-xs text-muted-foreground">No care plans.</p>}
          </div>
        )}

        {activeTab === "consent" && (
          <div className="space-y-2">
            {record?.consent?.all?.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/10">
                <div>
                  <p className="text-sm text-white capitalize">{c.consentType.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">Granted {new Date(c.grantedAt).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${c.status === "granted" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{c.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
