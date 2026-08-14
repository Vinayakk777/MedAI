import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Upload, FileText, Search, Filter, Download, Trash2, Archive,
  ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle2, X,
  Image, File, FileSpreadsheet, FileImage, AlertTriangle, Info,
  Activity, Pill, Brain, TrendingUp, Clock, Tag, Eye,
} from "lucide-react";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  lab_report: "Lab Report", blood_test: "Blood Test", urine_report: "Urine Report",
  discharge_summary: "Discharge Summary", prescription: "Prescription",
  referral_letter: "Referral Letter", vaccination_record: "Vaccination Record",
  medical_certificate: "Medical Certificate", operation_note: "Operation Note",
  clinical_progress_note: "Clinical Progress Note", chest_xray: "Chest X-Ray",
  dental_xray: "Dental X-Ray", skin_photograph: "Skin Photograph",
  eye_photograph: "Eye Photograph", wound_image: "Wound Image",
  ultrasound_report: "Ultrasound Report", ecg_printout: "ECG Printout",
  ct_report: "CT Report", mri_report: "MRI Report", other: "Other",
};

const DOCUMENT_TYPE_ICONS: Record<string, any> = {
  lab_report: FileSpreadsheet, blood_test: FileSpreadsheet, prescription: FileText,
  chest_xray: Image, dental_xray: Image, skin_photograph: FileImage,
  eye_photograph: FileImage, wound_image: FileImage, other: File,
};

export function DocumentCenter() {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("date");
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "labs" | "images" | "prescriptions">("all");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["medical-documents", searchQuery, typeFilter, sortBy],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (typeFilter) params.set("type", typeFilter);
      params.set("sortBy", sortBy === "name" ? "name" : sortBy === "type" ? "type" : "date");
      params.set("limit", "50");
      return fetch(`/api/medical-documents?${params}`).then((r) => r.json());
    },
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["medical-documents-stats"],
    queryFn: () => fetch("/api/medical-documents/stats/summary").then((r) => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/medical-documents/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["medical-documents"] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/medical-documents/${id}/archive`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: true }) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["medical-documents"] }),
  });

  const handleUpload = useCallback(async () => {
    if (!uploadFile) return;
    setUploadStatus("uploading");
    setUploadProgress("Uploading file...");
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("documentType", uploadType || "other");
      const res = await fetch("/api/medical-documents/upload", { method: "POST", body: form });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      setUploadStatus("processing");
      setUploadProgress("Processing document...");

      const processRes = await fetch(`/api/medical-documents/${result.documentId}/process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!processRes.ok) throw new Error("Processing failed");

      setUploadStatus("done");
      setUploadProgress("Document processed successfully");
      qc.invalidateQueries({ queryKey: ["medical-documents"] });
      setTimeout(() => { setShowUpload(false); setUploadFile(null); setUploadStatus("idle"); setUploadProgress(""); }, 2000);
    } catch (err) {
      setUploadStatus("error");
      setUploadProgress(String(err));
    }
  }, [uploadFile, uploadType, qc]);

  const docs = data?.documents || [];
  const filteredDocs = activeTab === "all" ? docs
    : activeTab === "labs" ? docs.filter((d: any) => ["lab_report", "blood_test", "urine_report"].includes(d.documentType))
    : activeTab === "images" ? docs.filter((d: any) => ["chest_xray", "dental_xray", "skin_photograph", "eye_photograph", "wound_image", "ultrasound_report", "ecg_printout", "ct_report", "mri_report"].includes(d.documentType))
    : docs.filter((d: any) => d.documentType === "prescription");

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading documents...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Document Center</h2>
          {stats && (
            <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full">
              {stats.totalDocuments} documents
            </span>
          )}
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600">
          <Upload className="w-4 h-4" /> Upload
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.totalDocuments} icon={FileText} color="text-cyan-400" />
          <StatCard label="Abnormal Labs" value={stats.abnormalLabCount} icon={AlertCircle} color="text-rose-400" warn />
          <StatCard label="Total Labs" value={stats.totalLabCount} icon={Activity} color="text-emerald-400" />
          <StatCard label="Types" value={Object.keys(stats.byType || {}).length} icon={Filter} color="text-blue-400" />
          <StatCard label="Size" value={formatSize(stats.totalSize)} icon={File} color="text-purple-400" />
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(["all", "labs", "images", "prescriptions"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${activeTab === tab ? "bg-cyan-500/20 text-cyan-300" : "text-muted-foreground hover:text-white"}`}>
              {tab === "all" ? "All" : tab}
            </button>
          ))}
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2 w-4 h-4 text-muted-foreground" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..." className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white text-sm" />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
            <option value="">All types</option>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document list */}
        <div className="lg:col-span-1 space-y-2 max-h-[600px] overflow-y-auto">
          {filteredDocs.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center text-muted-foreground">
              <Upload className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No documents found</p>
              <p className="text-xs mt-1">Upload your first medical document to get started.</p>
            </div>
          ) : filteredDocs.map((doc: any) => {
            const Icon = DOCUMENT_TYPE_ICONS[doc.documentType] || File;
            const statusColors: Record<string, string> = {
              analyzed: "text-emerald-400 bg-emerald-500/10",
              failed: "text-rose-400 bg-rose-500/10",
              uploading: "text-amber-400 bg-amber-500/10",
              ocr_processing: "text-cyan-400 bg-cyan-500/10",
            };
            return (
              <motion.button key={doc.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                onClick={() => setSelectedDoc(doc.id)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedDoc === doc.id ? "bg-cyan-500/10 border-cyan-500/30" : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"}`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{doc.title || doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColors[doc.status] || "text-muted-foreground bg-white/5"}`}>
                        {doc.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {selectedDoc ? (
            <DocumentDetailPanel documentId={selectedDoc} onDelete={() => { deleteMutation.mutate(selectedDoc); setSelectedDoc(null); }} onArchive={() => archiveMutation.mutate(selectedDoc)} />
          ) : showUpload ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white">Upload Medical Document</h3>

              {/* Drop zone */}
              <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-cyan-500/30 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}>
                {uploadFile ? (
                  <div className="space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-cyan-400" />
                    <p className="text-sm text-white">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    <button onClick={() => setUploadFile(null)} className="text-xs text-rose-400 hover:underline">Remove</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Drag & drop a file here, or click to browse</p>
                    <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, TIFF, BMP, TXT, CSV (max 50MB)</p>
                    <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }}
                      className="hidden" id="file-upload" />
                    <label htmlFor="file-upload" className="inline-block px-4 py-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-sm cursor-pointer hover:bg-cyan-500/30">
                      Browse Files
                    </label>
                  </div>
                )}
              </div>

              {/* Document type selector */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Document Type</label>
                <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                  <option value="">Auto-detect</option>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* Upload button */}
              <div className="flex items-center gap-3">
                <button onClick={handleUpload} disabled={!uploadFile || uploadStatus === "uploading" || uploadStatus === "processing"}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 disabled:opacity-50">
                  {(uploadStatus === "uploading" || uploadStatus === "processing") && <Loader2 className="w-4 h-4 animate-spin" />}
                  {uploadStatus === "uploading" ? "Uploading..." : uploadStatus === "processing" ? "Processing..." : "Upload & Process"}
                </button>
                {uploadProgress && (
                  <span className={`text-xs ${uploadStatus === "error" ? "text-rose-400" : "text-emerald-400"}`}>
                    {uploadProgress}
                  </span>
                )}
                <button onClick={() => { setShowUpload(false); setUploadFile(null); setUploadStatus("idle"); }}
                  className="text-xs text-muted-foreground hover:text-white">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a document to view details, or upload a new document</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, warn }: { label: string; value: any; icon: any; color: string; warn?: boolean }) {
  return (
    <div className={`bg-white/5 border ${warn ? "border-rose-500/20" : "border-white/10"} rounded-xl p-3`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value ?? "—"}</p>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

function DocumentDetailPanel({ documentId, onDelete, onArchive }: { documentId: string; onDelete: () => void; onArchive: () => void }) {
  const [activeTab, setActiveTab] = useState<"summary" | "labs" | "medications" | "image" | "trends">("summary");

  const { data: doc } = useQuery<any>({
    queryKey: ["medical-document", documentId],
    queryFn: () => fetch(`/api/medical-documents/${documentId}`).then((r) => r.json()),
  });

  const { data: labValues } = useQuery<any[]>({
    queryKey: ["doc-lab-values", documentId],
    queryFn: () => fetch(`/api/medical-documents/${documentId}/lab-values`).then((r) => r.json()),
    enabled: activeTab === "labs",
  });

  const { data: medications } = useQuery<any[]>({
    queryKey: ["doc-medications", documentId],
    queryFn: () => fetch(`/api/medical-documents/${documentId}/medications`).then((r) => r.json()),
    enabled: activeTab === "medications",
  });

  const { data: imageAnalysis } = useQuery<any>({
    queryKey: ["doc-image-analysis", documentId],
    queryFn: () => fetch(`/api/medical-documents/${documentId}/image-analysis`).then((r) => r.json()),
    enabled: activeTab === "image",
  });

  const { data: trends } = useQuery<any[]>({
    queryKey: ["doc-trends", documentId],
    queryFn: () => fetch(`/api/medical-documents/${documentId}/trends`).then((r) => r.json()),
    enabled: activeTab === "trends",
  });

  const { data: summary } = useQuery<any>({
    queryKey: ["doc-summary", documentId],
    queryFn: () => fetch(`/api/medical-documents/${documentId}/summary`).then((r) => r.json()),
    enabled: activeTab === "summary",
  });

  if (!doc) return <div className="text-muted-foreground p-4">Loading...</div>;

  const tabs = [
    { id: "summary", label: "Summary", icon: FileText },
    { id: "labs", label: "Lab Values", icon: Activity },
    { id: "medications", label: "Medications", icon: Pill },
    { id: "image", label: "Image Analysis", icon: Brain },
    { id: "trends", label: "Trends", icon: TrendingUp },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Header */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-white font-semibold">{doc.title || doc.fileName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onArchive} className="text-xs text-muted-foreground hover:text-white flex items-center gap-1">
              <Archive className="w-3 h-3" /> Archive
            </button>
            <button onClick={onDelete} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {doc.fileName && <InfoItem label="File" value={doc.fileName} />}
          {doc.fileSize && <InfoItem label="Size" value={formatSize(doc.fileSize)} />}
          {doc.status && <InfoItem label="Status" value={doc.status} />}
          {doc.ocrConfidence != null && <InfoItem label="OCR Confidence" value={`${Math.round(doc.ocrConfidence * 100)}%`} />}
          {doc.createdAt && <InfoItem label="Uploaded" value={new Date(doc.createdAt).toLocaleString()} />}
          {doc.tags?.length > 0 && <InfoItem label="Tags" value={doc.tags.join(", ")} />}
          {doc.aiSummary && <div className="col-span-full mt-2 p-3 bg-cyan-500/5 border border-cyan-500/10 rounded-lg">
            <p className="text-xs text-white/70">{doc.aiSummary}</p>
          </div>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? "bg-cyan-500/20 text-cyan-300" : "text-muted-foreground hover:text-white"}`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "summary" && summary && (
        <ClinicalSummaryCard summary={summary} />
      )}
      {activeTab === "labs" && (
        <LabResultsView values={labValues || []} />
      )}
      {activeTab === "medications" && (
        <MedicationCard medications={medications || []} />
      )}
      {activeTab === "image" && imageAnalysis && (
        <ImageAnalysisView analysis={imageAnalysis} />
      )}
      {activeTab === "trends" && (
        <TrendComparisonView comparisons={trends || []} />
      )}
    </motion.div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground block">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function ClinicalSummaryCard({ summary }: { summary: any }) {
  return (
    <div className="space-y-3">
      {/* Physician summary */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-cyan-400 mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Physician Summary
        </h4>
        <p className="text-sm text-white/80 whitespace-pre-wrap">{summary.physicianSummary}</p>
      </div>

      {/* Patient summary */}
      {summary.patientSummary && (
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-emerald-400 mb-2">Patient-Friendly Summary</h4>
          <p className="text-sm text-white/80 whitespace-pre-wrap">{summary.patientSummary}</p>
        </div>
      )}

      {/* Key findings */}
      {summary.keyFindings?.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-amber-400 mb-2">Key Findings</h4>
          <ul className="space-y-1">
            {summary.keyFindings.map((f: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                <span className="text-amber-400 mt-1">•</span> {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {summary.recommendations?.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-cyan-400 mb-2">Recommendations</h4>
          <ul className="space-y-1">
            {summary.recommendations.map((r: string, i: number) => (
              <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Medication summary */}
      {summary.medicationSummary?.details && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-purple-400 mb-2">Medication Summary</h4>
          <p className="text-sm text-white/70">{summary.medicationSummary.details}</p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-300">
          This summary is AI-generated for informational purposes only. All clinical decisions should be made by a qualified healthcare professional.
        </p>
      </div>
    </div>
  );
}

function LabResultsView({ values }: { values: any[] }) {
  if (values.length === 0) return <div className="text-muted-foreground text-sm p-4">No lab values extracted.</div>;

  const abnormal = values.filter((v) => v.isAbnormal);
  const normal = values.filter((v) => !v.isAbnormal);

  return (
    <div className="space-y-3">
      {abnormal.length > 0 && (
        <div className="bg-white/5 border border-rose-500/20 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-rose-400 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Abnormal Values ({abnormal.length})
          </h4>
          <div className="space-y-2">
            {abnormal.map((v: any, i: number) => (
              <LabValueRow key={i} value={v} />
            ))}
          </div>
        </div>
      )}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-emerald-400 mb-3">Normal Values ({normal.length})</h4>
        <div className="space-y-1">
          {normal.map((v: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-sm py-1">
              <span className="text-white/70">{v.testName}</span>
              <div className="flex items-center gap-3">
                <span className="text-white">{v.value} {v.unit}</span>
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{v.classification}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LabValueRow({ value }: { value: any }) {
  const classificationColors: Record<string, string> = {
    critical_high: "bg-red-500/20 text-red-300",
    critical_low: "bg-red-500/20 text-red-300",
    high: "bg-amber-500/20 text-amber-300",
    low: "bg-amber-500/20 text-amber-300",
    borderline: "bg-blue-500/20 text-blue-300",
    normal: "bg-emerald-500/20 text-emerald-300",
  };

  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-white font-medium">{value.testName}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${classificationColors[value.classification] || "bg-white/10 text-muted-foreground"}`}>
          {value.classification?.replace(/_/g, " ")}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
        <span>Value: <span className="text-white font-medium">{value.value} {value.unit}</span></span>
        {value.referenceRange && <span>Reference: {value.referenceRange}</span>}
        {value.confidence != null && <span>Confidence: {Math.round(value.confidence * 100)}%</span>}
      </div>
      {value.explanation && <p className="text-xs text-white/70 mt-1">{value.explanation}</p>}
      {value.patientExplanation && (
        <p className="text-xs text-cyan-300/70 mt-1 bg-cyan-500/5 p-2 rounded">{value.patientExplanation}</p>
      )}
    </div>
  );
}

function MedicationCard({ medications }: { medications: any[] }) {
  if (medications.length === 0) return <div className="text-muted-foreground text-sm p-4">No medications extracted.</div>;

  const issues = medications.filter((m) => m.isDuplicate || m.hasInteraction || m.allergyConflict || m.missingDosage);

  return (
    <div className="space-y-3">
      {issues.length > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-rose-400 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Issues Detected ({issues.length})
          </h4>
          <div className="space-y-1">
            {issues.map((m: any, i: number) => (
              <p key={i} className="text-xs text-rose-300/80">
                {m.isDuplicate && `⚠ Duplicate: ${m.medicationName}`}
                {m.hasInteraction && `⚠ Interaction: ${m.medicationName}${m.interactionDescription ? ` — ${m.interactionDescription}` : ""}`}
                {m.allergyConflict && `⚠ Allergy conflict: ${m.medicationName}${m.allergyDescription ? ` — ${m.allergyDescription}` : ""}`}
                {m.missingDosage && `⚠ Missing dosage: ${m.medicationName}`}
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-2">
        {medications.filter((m) => !m.isDuplicate).map((m: any, i: number) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-white font-medium">{m.medicationName}</span>
              {m.confidence != null && (
                <span className={`text-xs px-2 py-0.5 rounded ${m.confidence > 0.7 ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                  {Math.round(m.confidence * 100)}%
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {m.dosage && <span>Dosage: <span className="text-white">{m.dosage}</span></span>}
              {m.frequency && <span>Frequency: <span className="text-white">{m.frequency}</span></span>}
              {m.duration && <span>Duration: <span className="text-white">{m.duration}</span></span>}
              {m.route && <span>Route: <span className="text-white">{m.route}</span></span>}
              {m.specialInstructions && <span className="col-span-full">Instructions: <span className="text-white">{m.specialInstructions}</span></span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageAnalysisView({ analysis }: { analysis: any }) {
  return (
    <div className="space-y-3">
      {/* Quality metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Quality</p>
          <p className={`text-lg font-bold ${analysis.qualityScore > 0.7 ? "text-emerald-400" : analysis.qualityScore > 0.4 ? "text-amber-400" : "text-rose-400"}`}>
            {Math.round(analysis.qualityScore * 100)}%
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Completeness</p>
          <p className={`text-lg font-bold ${analysis.completenessScore > 0.7 ? "text-emerald-400" : "text-amber-400"}`}>
            {Math.round(analysis.completenessScore * 100)}%
          </p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Confidence</p>
          <p className={`text-lg font-bold ${analysis.overallConfidence > 0.7 ? "text-emerald-400" : analysis.overallConfidence > 0.4 ? "text-amber-400" : "text-rose-400"}`}>
            {Math.round(analysis.overallConfidence * 100)}%
          </p>
        </div>
      </div>

      {/* Findings */}
      {analysis.findings?.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-cyan-400 mb-2">Findings</h4>
          <div className="space-y-2">
            {analysis.findings.map((f: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${f.isCritical ? "bg-rose-500" : f.confidence > 0.6 ? "bg-amber-500" : "bg-blue-500"}`} />
                <div>
                  <p className="text-white/80">{f.observation}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Confidence: {Math.round(f.confidence * 100)}% | {f.category?.replace(/_/g, " ")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limitations */}
      {analysis.limitations?.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-amber-400 mb-2">Limitations</h4>
          <ul className="space-y-1">
            {analysis.limitations.map((l: string, i: number) => (
              <li key={i} className="text-xs text-amber-300/80 flex items-start gap-2">
                <span className="mt-1">•</span> {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-300">
          AI-generated image analysis is for informational purposes only. This is NOT a diagnostic interpretation.
          All medical decisions should be made by a qualified healthcare professional.
        </p>
      </div>
    </div>
  );
}

function TrendComparisonView({ comparisons }: { comparisons: any[] }) {
  if (comparisons.length === 0) return <div className="text-muted-foreground text-sm p-4">No trend data available. Upload multiple reports to enable comparison.</div>;

  const trendColors: Record<string, string> = {
    improving: "text-emerald-400 bg-emerald-500/10",
    worsening: "text-rose-400 bg-rose-500/10",
    stable: "text-blue-400 bg-blue-500/10",
    newly_abnormal: "text-amber-400 bg-amber-500/10",
    resolved: "text-emerald-400 bg-emerald-500/10",
  };
  const trendIcons: Record<string, any> = {
    improving: TrendingUp,
    worsening: TrendingUp,
    stable: CheckCircle2,
    newly_abnormal: AlertCircle,
    resolved: CheckCircle2,
  };

  const improving = comparisons.filter((c) => c.trend === "improving").length;
  const worsening = comparisons.filter((c) => c.trend === "worsening").length;
  const abnormal = comparisons.filter((c) => c.trend === "newly_abnormal").length;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-400">Improving</p>
          <p className="text-lg font-bold text-emerald-400">{improving}</p>
        </div>
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 text-center">
          <p className="text-xs text-rose-400">Worsening</p>
          <p className="text-lg font-bold text-rose-400">{worsening}</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-center">
          <p className="text-xs text-amber-400">Newly Abnormal</p>
          <p className="text-lg font-bold text-amber-400">{abnormal}</p>
        </div>
      </div>

      {/* Comparison rows */}
      <div className="space-y-2">
        {comparisons.map((c: any, i: number) => {
          const Icon = trendIcons[c.trend] || TrendingUp;
          return (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white font-medium">{c.testName}</span>
                <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${trendColors[c.trend] || "bg-white/10 text-muted-foreground"}`}>
                  <Icon className={`w-3 h-3 ${c.trend === "worsening" ? "rotate-180" : ""}`} />
                  {c.trend?.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Previous: </span>
                  <span className="text-white/70">{c.previousValue}</span>
                </div>
                <ChevronRightIcon className="w-3 h-3 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Current: </span>
                  <span className="text-white font-medium">{c.currentValue}</span>
                </div>
                {c.percentChange != null && (
                  <span className={`${c.percentChange > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    ({c.percentChange > 0 ? "+" : ""}{c.percentChange.toFixed(1)}%)
                  </span>
                )}
              </div>
              {c.unit && <p className="text-xs text-muted-foreground mt-1">Unit: {c.unit}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
