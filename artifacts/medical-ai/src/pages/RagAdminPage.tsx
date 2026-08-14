import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Database, Upload, RefreshCw, BarChart3, Trash2, Plus,
  BookOpen, FileText, Building2, AlertTriangle, CheckCircle,
  Search, Layers, Activity, Clock,
} from "lucide-react";

type RagStats = {
  documents: { totalDocuments: number; totalChunks: number; indexedDocuments: number; uniqueSources: number };
  retrievalLogs: number;
  citations: number;
  stages: string[];
  cache: { size: number; hitRate: number; totalHits: number };
};

type Document = {
  id: string;
  title: string;
  organization: string;
  category: string;
  chunkCount: number;
  isIndexed: boolean;
  createdAt: string;
};

export default function RagAdminPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "ingest" | "logs">("overview");
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<RagStats>({
    queryKey: ["rag-admin", "stats"],
    queryFn: () => fetch("/api/rag-admin/stats").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: docsData, isLoading: docsLoading } = useQuery<{ documents: Document[]; total: number }>({
    queryKey: ["rag-admin", "documents"],
    queryFn: () => fetch("/api/rag-admin/documents").then((r) => r.json()),
  });

  const reindexAll = useMutation({
    mutationFn: () => fetch("/api/rag-admin/reindex-all", { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rag-admin"] }); },
  });

  const clearCache = useMutation({
    mutationFn: () => fetch("/api/rag-admin/clear-cache", { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rag-admin"] }); },
  });

  const refreshEmbeddings = useMutation({
    mutationFn: () => fetch("/api/rag-admin/refresh-embeddings", { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rag-admin"] }); },
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => fetch(`/api/rag-admin/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rag-admin", "documents"] }); },
  });

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-cyan-400" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">RAG Knowledge Base</h1>
              <p className="text-xs text-muted-foreground/60">
                Medical evidence retrieval and knowledge management
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => clearCache.mutate()}
              className="px-2.5 py-1.5 text-[10px] rounded-lg text-muted-foreground/60 hover:text-foreground border border-white/10 hover:bg-white/5 transition-all">
              Clear Cache
            </button>
            <button onClick={() => refreshEmbeddings.mutate()}
              className="px-2.5 py-1.5 text-[10px] rounded-lg text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all">
              Refresh Embeddings
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/5">
          {[
            { id: "overview" as const, label: "Overview", icon: BarChart3 },
            { id: "documents" as const, label: "Documents", icon: FileText },
            { id: "ingest" as const, label: "Ingest", icon: Upload },
            { id: "logs" as const, label: "Logs", icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-all ${
                  activeTab === tab.id
                    ? "text-cyan-400 border-cyan-400"
                    : "text-muted-foreground/50 hover:text-foreground border-transparent"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {statsLoading ? (
              <div className="animate-pulse grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-xl" />)}
              </div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard icon={BookOpen} label="Documents" value={stats.documents.totalDocuments} color="text-cyan-400" />
                  <StatCard icon={Layers} label="Chunks" value={stats.documents.totalChunks} color="text-violet-400" />
                  <StatCard icon={Building2} label="Sources" value={stats.documents.uniqueSources} color="text-emerald-400" />
                  <StatCard icon={Activity} label="Retrievals" value={stats.retrievalLogs} color="text-amber-400" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard icon={FileText} label="Indexed" value={stats.documents.indexedDocuments} color="text-emerald-400" />
                  <StatCard icon={CheckCircle} label="Citations" value={stats.citations} color="text-blue-400" />
                  <StatCard icon={Clock} label="Cache Size" value={stats.cache.size} color="text-rose-400" />
                  <StatCard icon={Activity} label="Cache Hit Rate" value={`${(stats.cache.hitRate * 100).toFixed(0)}%`} color="text-cyan-400" />
                </div>

                <div className="rounded-xl border border-white/5 bg-card/70 backdrop-blur-sm p-4">
                  <h3 className="text-xs font-semibold text-foreground mb-3">Pipeline Stages</h3>
                  {stats.stages.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {stats.stages.map((stage: string) => (
                        <span key={stage} className="px-2 py-1 text-[10px] rounded-lg bg-white/5 text-muted-foreground/60">
                          {stage}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/40">No retrieval logs yet.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="p-6 text-center">
                <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Failed to load statistics.</p>
              </div>
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === "documents" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground/60">{docsData?.total ?? 0} document(s)</p>
              <button onClick={() => reindexAll.mutate()}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded-lg text-muted-foreground/60 hover:text-foreground border border-white/10 hover:bg-white/5 transition-all">
                <RefreshCw className="w-3 h-3" /> Re-index All
              </button>
            </div>

            {docsLoading ? (
              <div className="animate-pulse space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
              </div>
            ) : docsData?.documents.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/60">No documents in the knowledge base yet.</p>
                <p className="text-[10px] text-muted-foreground/40 mt-1">Upload documents using the Ingest tab.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {docsData?.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground truncate">{doc.title}</span>
                        {doc.isIndexed ? (
                          <span className="text-[9px] text-emerald-400/60 bg-emerald-500/10 px-1.5 py-0.5 rounded">Indexed</span>
                        ) : (
                          <span className="text-[9px] text-amber-400/60 bg-amber-500/10 px-1.5 py-0.5 rounded">Pending</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground/50">{doc.organization}</span>
                        <span className="text-[9px] text-muted-foreground/30">·</span>
                        <span className="text-[10px] text-muted-foreground/50">{doc.chunkCount} chunks</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => deleteDoc.mutate(doc.id)}
                        className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ingest Tab */}
        {activeTab === "ingest" && <IngestForm />}

        {/* Logs Tab */}
        {activeTab === "logs" && <RetrievalLogs />}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/5 bg-card/70 backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-muted-foreground/60">{label}</span>
      </div>
      <span className={`text-xl font-bold ${color}`}>{value}</span>
    </motion.div>
  );
}

function IngestForm() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState("");
  const [version, setVersion] = useState("");
  const [publicationDate, setPublicationDate] = useState("");

  const ingestMutation = useMutation({
    mutationFn: (body: any) => fetch("/api/rag-admin/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rag-admin"] });
      setTitle(""); setOrganization(""); setContent(""); setTags(""); setVersion(""); setPublicationDate("");
    },
  });

  return (
    <div className="rounded-xl border border-white/5 bg-card/70 backdrop-blur-sm p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4">Upload Medical Knowledge Document</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground/60 block mb-1">Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/60 block mb-1">Organization *</label>
            <input value={organization} onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground/60 block mb-1">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-background border border-white/10 text-foreground focus:outline-none">
              <option value="general">General</option>
              <option value="diagnosis">Diagnosis</option>
              <option value="medication">Medication</option>
              <option value="prevention">Prevention</option>
              <option value="self_care">Self-Care</option>
              <option value="lab">Lab</option>
              <option value="follow_up">Follow-Up</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/60 block mb-1">Version</label>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 2024"
              className="w-full px-3 py-2 text-xs rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/60 block mb-1">Publication Date</label>
            <input type="date" value={publicationDate} onChange={(e) => setPublicationDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-background border border-white/10 text-foreground focus:outline-none" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground/60 block mb-1">Tags (comma-separated)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="hypertension, cardiology, guidelines"
            className="w-full px-3 py-2 text-xs rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40" />
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground/60 block mb-1">Content *</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10}
            placeholder="Paste the medical guideline or textbook content here..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/40 resize-y" />
        </div>

        <button onClick={() => ingestMutation.mutate({
          title, organization, content, category,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          version: version || undefined,
          publicationDate: publicationDate || undefined,
          chunkerName: "recursive_character",
          maxChunkSize: 1000, chunkOverlap: 100,
        })}
          disabled={!title || !organization || !content}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all disabled:opacity-30">
          <Upload className="w-3.5 h-3.5" /> Ingest Document
        </button>

        {ingestMutation.isPending && <p className="text-[10px] text-muted-foreground/60">Ingesting and generating embeddings...</p>}
        {ingestMutation.isSuccess && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px]">
            Document ingested successfully!
          </div>
        )}
        {ingestMutation.isError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px]">
            Ingestion failed. Check the content and try again.
          </div>
        )}
      </div>
    </div>
  );
}

function RetrievalLogs() {
  const { data, isLoading } = useQuery<{ logs: any[]; total: number }>({
    queryKey: ["rag-admin", "logs"],
    queryFn: () => fetch("/api/rag/logs").then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded-xl" />)}
      </div>
    );
  }

  if (!data || data.logs.length === 0) {
    return (
      <div className="text-center py-8">
        <Activity className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground/60">No retrieval logs yet.</p>
        <p className="text-[10px] text-muted-foreground/40 mt-1">Logs appear automatically as users interact with the assistant.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground/60">{data.total} total retrievals</p>
      {data.logs.slice(0, 50).map((log) => (
        <div key={log.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/5 bg-white/[0.02]">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-foreground truncate">{log.query}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-muted-foreground/40">{log.pipelineStage ?? "general"}</span>
              <span className="text-[9px] text-muted-foreground/30">·</span>
              <span className="text-[9px] text-muted-foreground/40">{log.resultCount} results</span>
              {log.contextUsed && <span className="text-[9px] text-emerald-400/60">used</span>}
              {log.wasFallback && <span className="text-[9px] text-amber-400/60">fallback</span>}
              <span className="text-[9px] text-muted-foreground/30">·</span>
              <span className="text-[9px] text-muted-foreground/40">{log.latencyMs}ms</span>
            </div>
          </div>
          <span className="text-[9px] text-muted-foreground/30">{new Date(log.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
