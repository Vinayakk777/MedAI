import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { FileText, Plus, RotateCcw, GitCompare, CheckCircle, Clock, AlertTriangle } from "lucide-react";

export function PromptVersionManager() {
  const qc = useQueryClient();
  const [selectedName, setSelectedName] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ name: "", content: "", changeLog: "" });

  const { data: names } = useQuery<string[]>({
    queryKey: ["prompt-names"],
    queryFn: () => fetch("/api/observability/prompts").then((r) => r.json()),
  });

  const { data: versions, isLoading } = useQuery<any[]>({
    queryKey: ["prompt-versions", selectedName],
    queryFn: () => fetch(`/api/observability/prompts?name=${selectedName}`).then((r) => r.json()),
    enabled: !!selectedName,
  });

  const { data: active } = useQuery<any>({
    queryKey: ["prompt-active", selectedName],
    queryFn: () => fetch(`/api/observability/prompts/active?name=${selectedName}`).then((r) => r.json()),
    enabled: !!selectedName,
  });

  const createMutation = useMutation({
    mutationFn: () => fetch("/api/observability/prompts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPrompt),
    }).then((r) => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prompt-versions"] }); qc.invalidateQueries({ queryKey: ["prompt-names"] }); setShowCreate(false); setNewPrompt({ name: "", content: "", changeLog: "" }); },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/observability/prompts/${id}/activate`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompt-versions"] }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Prompt Version Manager</h2>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-sm hover:bg-cyan-500/30">
          <Plus className="w-4 h-4" /> New Version
        </button>
      </div>

      {/* Create new */}
      {showCreate && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
          <input value={newPrompt.name} onChange={(e) => setNewPrompt({ ...newPrompt, name: e.target.value })}
            placeholder="Prompt name (e.g. system_prompt, triage_prompt)" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          <textarea value={newPrompt.content} onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })}
            placeholder="Prompt content..." rows={8} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono" />
          <input value={newPrompt.changeLog} onChange={(e) => setNewPrompt({ ...newPrompt, changeLog: e.target.value })}
            placeholder="Change log description" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          <button onClick={() => createMutation.mutate()} disabled={!newPrompt.name || !newPrompt.content}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm hover:bg-cyan-600 disabled:opacity-50">
            Create Version
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Prompt names sidebar */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Prompts</h3>
          <div className="space-y-1">
            {names?.map((name) => (
              <button key={name} onClick={() => setSelectedName(name)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedName === name ? "bg-cyan-500/10 text-cyan-300" : "text-white/70 hover:bg-white/[0.05]"}`}>
                {name}
              </button>
            ))}
            {(!names || names.length === 0) && <p className="text-xs text-muted-foreground">No prompts yet</p>}
          </div>
        </div>

        {/* Version list */}
        <div className="lg:col-span-3 bg-white/5 border border-white/10 rounded-xl p-5">
          {selectedName ? (
            <>
              {/* Active version indicator */}
              {active && (
                <div className="flex items-center gap-2 mb-4 text-xs bg-emerald-500/10 text-emerald-300 px-3 py-2 rounded-lg border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4" />
                  Active: v{active.version} — {active.changeLog || "No description"} (activated {new Date(active.activatedAt || active.createdAt).toLocaleDateString()})
                </div>
              )}

              <h3 className="text-sm font-semibold text-white mb-4">Version History</h3>
              {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {versions?.map((v: any) => (
                    <motion.div key={v.id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                      className={`flex items-center gap-4 p-3 rounded-lg border ${v.status === "active" ? "bg-emerald-500/5 border-emerald-500/30" : "bg-white/[0.02] border-white/10"}`}>
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/5 text-white font-bold text-sm">
                        v{v.version}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${v.status === "active" ? "bg-emerald-500/20 text-emerald-300" : v.status === "draft" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-muted-foreground"}`}>
                            {v.status}
                          </span>
                          <span className="text-xs text-muted-foreground">by {v.author || "unknown"}</span>
                          <span className="text-xs text-muted-foreground"><Clock className="w-3 h-3 inline" /> {new Date(v.createdAt).toLocaleString()}</span>
                        </div>
                        {v.changeLog && <p className="text-xs text-white/60 truncate">{v.changeLog}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {v.status !== "active" && (
                          <button onClick={() => activateMutation.mutate(v.id)}
                            className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded hover:bg-cyan-500/30">
                            Activate
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Select a prompt to view its version history
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
