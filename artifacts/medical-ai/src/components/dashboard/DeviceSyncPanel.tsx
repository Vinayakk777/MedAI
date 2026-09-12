import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smartphone, Link2, Unlink, RefreshCw, CheckCircle, AlertTriangle, Loader2, Activity, PlugZap, FlaskConical, Watch, Heart } from "lucide-react";

type ProviderInfo = { name: string; displayName: string; connected: boolean };
type ProviderConfig = { accessToken?: string; refreshToken?: string; expiresAt?: number; scopes?: string[]; demo?: boolean };

const STORAGE_KEY_MAP: Record<string, string> = {
  google_health: "medai_health_provider_config",
  google_fit: "medai_google_fit_config",
  fitbit: "medai_fitbit_config",
};

function loadConfig(name: string): ProviderConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MAP[name] ?? `medai_${name}_config`);
    return raw ? (JSON.parse(raw) as ProviderConfig) : null;
  } catch { return null; }
}
function saveConfig(name: string, config: ProviderConfig) {
  localStorage.setItem(STORAGE_KEY_MAP[name] ?? `medai_${name}_config`, JSON.stringify(config));
}
function clearConfig(name: string) {
  localStorage.removeItem(STORAGE_KEY_MAP[name] ?? `medai_${name}_config`);
}

const PROVIDER_META: Record<string, { icon: React.ElementType; gradient: string; border: string; description: string }> = {
  google_health: { icon: Activity, gradient: "from-emerald-500/20 to-cyan-500/20", border: "border-emerald-500/20", description: "Sync heart rate, steps, sleep, and more from Google Health into your trends, goals, and preventive care." },
  google_fit: { icon: Activity, gradient: "from-blue-500/20 to-cyan-500/20", border: "border-blue-500/20", description: "Pull activity, heart rate, sleep, and body metrics from Google Fit into your health dashboard." },
  fitbit: { icon: Watch, gradient: "from-cyan-500/20 to-blue-500/20", border: "border-cyan-500/20", description: "Sync heart rate, steps, sleep, SpO2, and respiratory rate from your Fitbit device." },
};

function ProviderCard({ name, displayName, config, setConfig, setStatus }: {
  name: string; displayName: string; config: ProviderConfig | null;
  setConfig: (c: ProviderConfig | null) => void; setStatus: (s: string) => void;
}) {
  const queryClient = useQueryClient();
  const meta = PROVIDER_META[name] ?? { icon: Activity, gradient: "from-white/10 to-white/5", border: "border-white/10", description: "" };
  const Icon = meta.icon;
  const connected = !!(config?.accessToken && !config?.demo);
  const isDemo = !!(config?.demo || (config?.accessToken ?? "").startsWith("medbot-demo-gtoken-"));

  const connect = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dashboard/providers/${name}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUri: `${window.location.origin}/dashboard` }),
      });
      if (!res.ok) throw new Error(`Connect failed (HTTP ${res.status})`);
      return res.json() as Promise<{ url?: string; demo?: boolean; config?: ProviderConfig; message?: string }>;
    },
    onSuccess: (data) => {
      if (data.demo && data.config) {
        const finalConfig = { ...data.config, demo: true };
        saveConfig(name, finalConfig);
        setConfig(finalConfig);
        setStatus(data.message ?? `${displayName} enabled in demo mode — data is simulated.`);
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        return;
      }
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => setStatus(`Connection failed: ${err instanceof Error ? err.message : String(err)}`),
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dashboard/providers/${name}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json() as Promise<{ synced: number; demo?: boolean }>;
    },
    onSuccess: (data) => {
      if (data.synced === 1) {
        setStatus(data.demo ? `${displayName}: synced simulated demo data — NOT real health readings.` : `${displayName}: synced successfully!`);
      } else {
        setStatus(`${displayName}: nothing to sync.`);
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "vitals"] });
    },
    onError: (err) => setStatus(`Sync failed: ${err instanceof Error ? err.message : String(err)}`),
  });

  return (
    <div className="rounded-xl border border-white/8 bg-background/40 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} ${meta.border} border flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5 text-foreground/70" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{displayName}</p>
          <p className="text-[11px] text-muted-foreground/60">
            {isDemo ? "Demo mode — simulated data" : connected ? "Connected — ready to sync" : meta.description}
          </p>
        </div>
        {connected ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
            <CheckCircle className="w-3 h-3" /> Connected
          </span>
        ) : isDemo ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-1 rounded-full">
            <FlaskConical className="w-3 h-3" /> Demo
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/50 bg-white/5 border border-white/10 px-2 py-1 rounded-full">
            <Link2 className="w-3 h-3" /> Not connected
          </span>
        )}
      </div>

      {isDemo && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-300/80 leading-relaxed">
            Simulated demo data — not your real health readings. Connect real credentials to sync actual data.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 mt-4">
        {!connected && !isDemo ? (
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-colors disabled:opacity-50"
          >
            {connect.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Connect {displayName}
          </button>
        ) : (
          <>
            <button
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 hover:bg-cyan-500/15 transition-colors disabled:opacity-50"
            >
              {sync.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync now
            </button>
            <button
              onClick={() => { clearConfig(name); setConfig(null); setStatus(`${displayName} disconnected.`); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground/60 hover:text-rose-400 hover:bg-rose-500/8 border border-white/8 transition-colors"
            >
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function DeviceSyncPanel() {
  const [status, setStatus] = useState<string | null>(null);

  const googleHealthConfig = loadConfig("google_health");
  const [gc, setGc] = useState<ProviderConfig | null>(() => googleHealthConfig);
  const googleFitConfig = loadConfig("google_fit");
  const [gfc, setGfc] = useState<ProviderConfig | null>(() => googleFitConfig);
  const fitbitConfig = loadConfig("fitbit");
  const [fc, setFc] = useState<ProviderConfig | null>(() => fitbitConfig);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && state) {
      const providerName = state.replace("medai-", "");
      const saved = loadConfig(providerName);
      if (!saved) {
        fetch(`/api/dashboard/providers/${providerName}/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, redirectUri: `${window.location.origin}/dashboard` }),
        })
          .then((r) => r.json())
          .then((data: any) => {
            if (data.config?.accessToken) {
              saveConfig(providerName, data.config);
              setStatus(`Connected successfully!`);
            }
          })
          .catch(() => setStatus("OAuth callback failed"));
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const configs: Record<string, [ProviderConfig | null, (c: ProviderConfig | null) => void]> = {
    google_health: [gc, setGc],
    google_fit: [gfc, setGfc],
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="rounded-2xl border border-white/5 bg-card/70 backdrop-blur-sm p-6"
    >
      <div className="flex items-center gap-2 mb-1">
        <PlugZap className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">Connected Devices</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Sync heart rate, steps, sleep, and more from your devices into your trends, goals, and preventive care.
      </p>

      <div className="space-y-3">
        {(["google_health", "google_fit"] as const).map((name) => {
          const [cfg, setCfg] = configs[name];
          return (
            <ProviderCard
              key={name}
              name={name}
              displayName={name === "google_health" ? "Google Health" : "Google Fit"}
              config={cfg}
              setConfig={setCfg}
              setStatus={setStatus}
            />
          );
        })}

        <div className="rounded-xl border border-white/5 bg-white/3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Watch className="w-4 h-4 text-muted-foreground/40" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground/60">Fitbit</p>
              <p className="text-[11px] text-muted-foreground/40">Heart rate, sleep, SpO₂, steps from your Fitbit device</p>
            </div>
            <span className="text-[10px] text-muted-foreground/30 border border-white/8 px-2 py-0.5 rounded-full">coming soon</span>
          </div>
        </div>

        {status && (
          <div className="flex items-start gap-2 text-xs rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-2.5">
            {status.includes("failed") || status.includes("Failed") ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
            )}
            <span className="text-muted-foreground">{status}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
