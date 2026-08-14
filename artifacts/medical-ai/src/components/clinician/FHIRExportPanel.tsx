import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Download, FileText, Copy, CheckCircle } from "lucide-react";

export function FHIRExportPanel() {
  const [patientUserId, setPatientUserId] = useState("");
  const [exportType, setExportType] = useState("Condition");
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const exportMutation = useMutation({
    mutationFn: (data: { patientUserId: string; exportType: string }) =>
      fetch("/api/clinician/fhir/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (res) => setResult(res),
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <FileText className="w-6 h-6 text-cyan-400" />
        <h2 className="text-xl font-bold text-white">FHIR Export</h2>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Patient User ID</label>
            <input value={patientUserId} onChange={(e) => setPatientUserId(e.target.value)}
              placeholder="Patient ID" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">FHIR Resource Type</label>
            <select value={exportType} onChange={(e) => setExportType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
              <option value="Condition">Condition</option>
              <option value="Observation">Observation</option>
              <option value="MedicationRequest">MedicationRequest</option>
              <option value="AllergyIntolerance">AllergyIntolerance</option>
              <option value="Patient">Patient</option>
              <option value="Encounter">Encounter</option>
              <option value="CarePlan">CarePlan</option>
              <option value="DiagnosticReport">DiagnosticReport</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => exportMutation.mutate({ patientUserId, exportType })}
              disabled={!patientUserId || exportMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 disabled:opacity-50">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>
      </div>

      {/* FHIR specification info */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-3 text-xs text-muted-foreground">
        Exports data in HL7 FHIR R4 format. Resources are mapped from internal structures using vendor-agnostic FHIR adapters.
      </div>

      {/* Export result */}
      {result && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">FHIR Export Result</h3>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                {copied ? <><CheckCircle className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
              <button onClick={() => { const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `fhir-${exportType.toLowerCase()}-${patientUserId.slice(0, 8)}.json`; a.click(); URL.revokeObjectURL(url); }}
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300">
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>

          {/* Summary stats */}
          {result.resourceType && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Resource Type: <span className="text-white">{result.resourceType}</span></span>
              {result.id && <span>ID: <span className="text-white">{result.id}</span></span>}
              {result.subject?.reference && <span>Subject: <span className="text-white">{result.subject.reference}</span></span>}
            </div>
          )}
          {result.entry && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Bundle Entries: <span className="text-white">{result.entry?.length || 0}</span></span>
              <span>Total: <span className="text-white">{result.total || result.entry?.length || 0}</span></span>
            </div>
          )}

          <div className="bg-black/30 rounded-lg p-3 max-h-96 overflow-y-auto">
            <pre className="text-xs text-white/70 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          </div>
        </motion.div>
      )}
    </div>
  );
}
