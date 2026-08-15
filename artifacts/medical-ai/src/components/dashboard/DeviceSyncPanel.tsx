import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smartphone, Link2, Unlink, RefreshCw, CheckCircle, AlertTriangle, Loader2, Activity, PlugZap, FlaskConical } from "lucide-react";

type ProviderInfo = {
  name: string;
  displayName: string;
  connected: boolean;
};

type ProviderConfig = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  demo?: boolean;
};

const STORAGE_KEY = "medai_health_provider_config";

function loadConfig(): ProviderConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProviderConfig) : null;
  } catch {
    return null;
  }
}

function saveConfig(config: ProviderConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

const DEMO_NOTE =
  "You haven't connected a real Google account. These vitals are simulated demo data, not your actual health readings.";

export function DeviceSyncPanel() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<ProviderConfig | null>(() => loadConfig());
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const { data: providers, isLoading: providersLoading } = useQuery<ProviderInfo[]>({
    queryKey: ["dashboard", "providers"],
    queryFn: () => fetch("/api/dashboard/providers").then((r) => r.json()),
  });

  // Handle OAuth callback code from URL (?code=...) after Google consent redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && !config) {
      exchangeCode.mutate(code);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/dashboard/providers/${name}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUri: `${window.location.origin}/dashboard` }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Failed to build connect URL (HTTP ${res.status})`);
      }
      return res.json() as Promise<{ url?: string; demo?: boolean; config?: ProviderConfig; message?: string }>;
    },
    onSuccess: (data) => {
      if (data.demo && data.config) {
        // Demo is the only available option when Google Health credentials
        // aren't configured on the server. Enable it seamlessly but keep it
        // clearly labeled as simulated so it's never mistaken for real data.
        setConnecting(false);
        enableDemo(data.config, data.message);
        return;
      }
      if (!data.url) return;
      setStatus("Opening Google authorization window…");
      window.open(data.url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => {
      setConnecting(false);
      setStatus(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const enableDemo = (demoConfig: ProviderConfig, message?: string) => {
    const finalConfig: ProviderConfig = { ...demoConfig, demo: true };
    saveConfig(finalConfig);
    setConfig(finalConfig);
    setStatus(message ?? "Demo preview enabled — any vitals shown are simulated, not from your real account.");
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const exchangeCode = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/dashboard/providers/google_health/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirectUri: `${window.location.origin}/dashboard` }),
      });
      if (!res.ok) throw new Error("Failed to exchange code");
      return res.json() as Promise<{ success: boolean; config: ProviderConfig }>;
    },
    onSuccess: (data) => {
      if (data.config?.accessToken) {
        saveConfig(data.config);
        setConfig(data.config);
        setStatus("Connected successfully. Ready to sync.");
      }
    },
    onError: (err) => {
      setStatus(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/dashboard/providers/google_health/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) throw new Error("Sync failed");
      return res.json() as Promise<{
        synced: number;
        vital: any;
        metric: any;
        wellnessGoalsCreated: number;
        remindersCreated: number;
        demo?: boolean;
      }>;
    },
    onSuccess: (data) => {
      if (data.synced === 1) {
        if (data.demo) {
          setStatus("Synced simulated demo vitals — NOT your real health data. Connect a real Google account to sync actual readings.");
        } else {
          setStatus(
            `Synced! Vitals recorded${data.wellnessGoalsCreated ? `, ${data.wellnessGoalsCreated} wellness goal(s) created` : ""}${data.remindersCreated ? `, ${data.remindersCreated} preventive reminder(s) created` : ""}.`,
          );
        }
      } else {
        setStatus("Nothing to sync — connect first.");
      }
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["wellness"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "vitals"] });
    },
    onError: (err) => {
      setStatus(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const connected = !!config?.accessToken;
  const isDemoConnected = !!(config?.demo || (config?.accessToken ?? "").startsWith("medbot-demo-gtoken-"));
  const googleProvider = providers?.find((p) => p.name === "google_health");

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
        Sync heart rate, steps, sleep, and more from Google Health into your trends, goals, and preventive care.
      </p>

      <div className="space-y-3">
        <div className="rounded-xl border border-white/8 bg-background/40 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {googleProvider?.displayName ?? "Google Health"}
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                {isDemoConnected
                  ? "Demo preview — showing simulated data, not your real account"
                  : connected
                    ? "Connected — data will sync into Health Trends, Wellness Goals, and Preventive Care"
                    : "Not connected — authorize to pull your heart rate, steps, sleep & vitals"}
              </p>
            </div>
            {connected ? (
              isDemoConnected ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-1 rounded-full">
                  <FlaskConical className="w-3 h-3" /> Demo
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                  <CheckCircle className="w-3 h-3" /> Connected
                </span>
              )
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/50 bg-white/5 border border-white/10 px-2 py-1 rounded-full">
                <Link2 className="w-3 h-3" /> Not connected
              </span>
            )}
          </div>

          {isDemoConnected && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-300/80 leading-relaxed">{DEMO_NOTE}</p>
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            {!connected ? (
              <button
                onClick={() => {
                  setStatus(null);
                  setConnecting(true);
                  connect.mutate("google_health");
                  setTimeout(() => setConnecting(false), 1500);
                }}
                disabled={connect.isPending || connecting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {connect.isPending || connecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Link2 className="w-3.5 h-3.5" />
                )}
                Connect Google Health
              </button>
            ) : (
              <>
                <button
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 hover:bg-cyan-500/15 transition-colors disabled:opacity-50"
                >
                  {sync.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Sync now
                </button>
                <button
                  onClick={() => {
                    clearConfig();
                    setConfig(null);
                    setStatus("Disconnected.");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground/60 hover:text-rose-400 hover:bg-rose-500/8 border border-white/8 transition-colors"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </>
            )}
          </div>

          {!connected && (
            <p className="text-[10px] text-muted-foreground/40 mt-3 flex items-start gap-1.5">
              <Smartphone className="w-3 h-3 flex-shrink-0 mt-0.5" />
              {isDemoConnected
                ? "Simulated vitals are enabled. Connect real Google Health credentials to sync your actual readings."
                : "You'll be redirected to Google to authorize. Once approved, you'll return here and can sync immediately."}
            </p>
          )}
        </div>

        {providers && providers.filter((p) => p.name !== "google_health" && p.name !== "google_fit").length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground/30 uppercase tracking-widest">More providers</p>
            {providers
              .filter((p) => p.name !== "google_health" && p.name !== "google_fit")
              .map((p) => (
                <div key={p.name} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/3 px-3 py-2">
                  <span className="text-xs text-foreground/70">{p.displayName}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/40 border border-white/8 px-1.5 py-0.5 rounded-full">coming soon</span>
                </div>
              ))}
          </div>
        )}

        {status && (
          <div className="flex items-start gap-2 text-xs rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-2.5">
            {status.startsWith("Sync failed") || status.startsWith("Connection failed") ? (
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
