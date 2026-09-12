import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Loader2, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  onDone?: () => void;
}

const STORAGE_KEY = "medai_google_fit_config";

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function GoogleFitSync({ onDone }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const queryClient = useQueryClient();

  const sync = useMutation({
    mutationFn: async () => {
      const config = loadConfig();
      if (!config?.accessToken) {
        throw new Error("NOT_CONNECTED");
      }
      const res = await fetch("/api/dashboard/vitals/sync-google-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.synced === 1) {
        setStatus("Google Fit synced successfully!");
      } else {
        setStatus(data.message ?? "No new data to sync.");
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard", "vitals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "vitals", "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "vitals", "history"] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Sync failed";
      if (msg === "NOT_CONNECTED") {
        setStatus("Google Fit isn't connected yet. Connect Google Fit to import your available health data.");
      } else {
        setStatus(msg);
      }
    },
  });

  const config = loadConfig();
  const isConnected = !!(config?.accessToken && !config?.demo);

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-[#0f1117] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Sync from Google Fit</h3>
        </div>
        {onDone && <button onClick={onDone} className="text-white/40 hover:text-white text-lg">×</button>}
      </div>

      {!isConnected ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-3 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            Google Fit isn't connected yet. Connect Google Fit to import your available health data.
          </p>
        </div>
      ) : result?.synced === 1 ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-3 mb-3">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-emerald-300 font-semibold">Google Fit synced successfully!</p>
            <p className="text-[11px] text-emerald-300/60 mt-1">
              Imported: {[result.vital?.heartRate && "Heart Rate", result.vital?.systolic && "Blood Pressure",
                result.vital?.weight && "Weight", result.vital?.oxygenSaturation && "SpO₂",
                result.vital?.bloodGlucose && "Blood Glucose"].filter(Boolean).join(", ") || "No vitals available"}
            </p>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-white/40 mb-4">
        Pull your latest heart rate, steps, sleep, and body metrics from Google Fit into your health dashboard.
      </p>

      {status && (
        <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 mb-3 ${
          status.includes("failed") || status.includes("isn't connected")
            ? "border border-amber-500/15 bg-amber-500/5 text-amber-300/80"
            : "border border-emerald-500/15 bg-emerald-500/5 text-emerald-300/80"
        }`}>
          {status.includes("failed") || status.includes("isn't connected") ? (
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          )}
          <span>{status}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-500/80 hover:bg-blue-500 disabled:opacity-50"
        >
          {sync.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {sync.isPending ? "Syncing..." : "Sync Google Fit"}
        </button>
        {onDone && (
          <button onClick={onDone} className="px-4 py-2 rounded-xl text-xs text-white/50 border border-white/10 hover:bg-white/5">
            Done
          </button>
        )}
      </div>

      <p className="text-[9px] text-white/20 mt-3">
        Only data available from your Google Fit account will be imported. Missing metrics will be null.
      </p>
    </div>
  );
}
