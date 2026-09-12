export interface HealthProviderVitals {
  heartRate?: number;
  systolic?: number;
  diastolic?: number;
  respiratoryRate?: number;
  temperature?: number;
  oxygenSaturation?: number;
  bloodGlucose?: number;
  weight?: number;
  height?: number;
  steps?: number;
  sleepHours?: number;
  caloriesBurned?: number;
  activityLevel?: number;
  stressLevel?: number;
}

export interface HealthProviderConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  scopes?: string[];
  expiresAt?: number;
}

export interface HealthProvider {
  readonly name: string;
  readonly displayName: string;
  isConnected(config: HealthProviderConfig): boolean;
  fetchLatestVitals(config: HealthProviderConfig): Promise<HealthProviderVitals>;
  fetchVitalsHistory(config: HealthProviderConfig, from: Date, to: Date): Promise<HealthProviderVitals[]>;
  connectUrl(redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<HealthProviderConfig>;
  refreshAccessToken(config: HealthProviderConfig): Promise<HealthProviderConfig>;
}

const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_HEALTH_API_BASE = "https://health.googleapis.com/v4/users/me/dataTypes";

const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

function getGoogleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleHealthConfigured(): boolean {
  return getGoogleCredentials() !== null;
}

const DEMO_TOKEN_PREFIX = "medbot-demo-gtoken-";

export function isDemoToken(token?: string): boolean {
  return !!token && token.startsWith(DEMO_TOKEN_PREFIX);
}

export function createDemoHealthConfig(providerName: string): HealthProviderConfig {
  return {
    accessToken: `${DEMO_TOKEN_PREFIX}${providerName}-${Date.now()}`,
    refreshToken: `medbot-demo-grefresh-${providerName}`,
    scopes: GOOGLE_HEALTH_SCOPES,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
}

function mockVitals(): HealthProviderVitals {
  return {
    heartRate: Math.floor(60 + Math.random() * 40),
    systolic: Math.floor(110 + Math.random() * 15),
    diastolic: Math.floor(70 + Math.random() * 10),
    respiratoryRate: Math.floor(12 + Math.random() * 8),
    temperature: +(36.5 + Math.random() * 1.0).toFixed(1),
    oxygenSaturation: Math.floor(95 + Math.random() * 5),
    steps: Math.floor(5000 + Math.random() * 5000),
    sleepHours: +(6 + Math.random() * 3).toFixed(1),
    caloriesBurned: Math.floor(1500 + Math.random() * 1000),
    activityLevel: Math.floor(Math.random() * 10),
    stressLevel: Math.floor(Math.random() * 10),
  };
}

function mockVitalsHistory(from: Date, to: Date): HealthProviderVitals[] {
  const days = Math.min(Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)), 90);
  const history: HealthProviderVitals[] = [];
  for (let i = 0; i < Math.max(days, 0); i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    history.push({
      heartRate: Math.floor(60 + Math.random() * 40),
      systolic: Math.floor(110 + Math.random() * 15),
      diastolic: Math.floor(70 + Math.random() * 10),
      steps: Math.floor(3000 + Math.random() * 7000),
      sleepHours: +(6 + Math.random() * 3).toFixed(1),
    });
  }
  return history;
}

async function googleFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Health API error ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

function toIso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function latestNumeric(dataPoints: any[], pick: (dp: any) => any): number | undefined {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) return undefined;
  const vals = dataPoints.map(pick).map(num).filter((v): v is number => v != null);
  return vals.length > 0 ? vals[0] : undefined;
}

interface GoogleDataPoint {
  dataSource?: { platform?: string; device?: { displayName?: string } };
  steps?: { count?: string; interval?: { startTime?: string; endTime?: string } };
  floors?: { count?: string };
  distance?: { value?: string };
  heartRate?: { bpm?: string; interval?: { startTime?: string; endTime?: string } };
  sleep?: { interval?: { startTime?: string; endTime?: string }; type?: string; stages?: any[] };
  weight?: { value?: string };
  height?: { value?: string };
  oxygenSaturation?: { value?: string; sleepSegment?: boolean };
  bloodGlucose?: { value?: string };
  bloodPressure?: { systolic?: string; diastolic?: string };
  dailyRestingHeartRate?: { value?: string };
  respiratoryRate?: { value?: string };
  bodyTemperature?: { value?: string };
  activeMinutes?: { value?: string };
  heartRateVariability?: { value?: string };
  stressLevel?: { value?: string };
  caloriesBurned?: { value?: string };
  activeEnergyBurned?: { value?: string };
  activityLevel?: { value?: string };
}

function sleepHoursFromSleepPoints(points: GoogleDataPoint[]): number | undefined {
  if (!Array.isArray(points) || points.length === 0) return undefined;
  const totalMs = points.reduce((sum, p) => {
    const start = p.sleep?.interval?.startTime;
    const end = p.sleep?.interval?.endTime;
    if (!start || !end) return sum;
    const dur = new Date(end).getTime() - new Date(start).getTime();
    return sum + (Number.isFinite(dur) ? dur : 0);
  }, 0);
  if (totalMs <= 0) return undefined;
  return Math.round((totalMs / 3_600_000) * 10) / 10;
}

class MockHealthProvider implements HealthProvider {
  readonly name: string;
  readonly displayName: string;

  constructor(name: string, displayName: string) {
    this.name = name;
    this.displayName = displayName;
  }

  isConnected(_config: HealthProviderConfig): boolean {
    return !!(_config.accessToken || _config.clientId);
  }

  async fetchLatestVitals(_config: HealthProviderConfig): Promise<HealthProviderVitals> {
    return mockVitals();
  }

  async fetchVitalsHistory(_config: HealthProviderConfig, from: Date, to: Date): Promise<HealthProviderVitals[]> {
    return mockVitalsHistory(from, to);
  }

  connectUrl(_redirectUri: string): string {
    return `https://${this.name}.example.com/connect`;
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<HealthProviderConfig> {
    return { accessToken: `mock-token-${this.name}-${Date.now()}`, refreshToken: `mock-refresh-${this.name}` };
  }

  async refreshAccessToken(config: HealthProviderConfig): Promise<HealthProviderConfig> {
    return { ...config, accessToken: `refreshed-token-${this.name}-${Date.now()}` };
  }
}

class GoogleHealthProvider implements HealthProvider {
  readonly name = "google_health";
  readonly displayName = "Google Health";

  isConnected(config: HealthProviderConfig): boolean {
    return !!(config.accessToken || config.refreshToken);
  }

  private isDemo(config: HealthProviderConfig): boolean {
    return isDemoToken(config.accessToken) || isDemoToken(config.refreshToken);
  }

  connectUrl(redirectUri: string): string {
    const creds = getGoogleCredentials();
    if (!creds) {
      throw new Error(
        "Google Health is not configured with GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET. " +
        "The app will use demo mode instead.",
      );
    }
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_HEALTH_SCOPES.join(" "),
    });
    return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<HealthProviderConfig> {
    if (code.startsWith("medbot-demo-") || code.startsWith("demo-")) {
      return createDemoHealthConfig("google_health");
    }
    const creds = getGoogleCredentials();
    if (!creds) {
      throw new Error(
        "Google Health is not configured with GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET. " +
        "The app will use demo mode instead.",
      );
    }
    const body = new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const token = await googleFetch<{ access_token?: string; refresh_token?: string; expires_in?: number }>(
      GOOGLE_OAUTH_TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );

    if (!token.access_token) {
      throw new Error("Token exchange failed: no access token returned");
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scopes: GOOGLE_HEALTH_SCOPES,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    };
  }

  async refreshAccessToken(config: HealthProviderConfig): Promise<HealthProviderConfig> {
    if (this.isDemo(config)) return { ...config, accessToken: config.accessToken ?? createDemoHealthConfig("google_health").accessToken };
    const creds = getGoogleCredentials();
    if (!creds) return config;
    if (!config.refreshToken) return config;

    const body = new URLSearchParams({
      refresh_token: config.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
    });

    const token = await googleFetch<{ access_token?: string; expires_in?: number }>(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    return {
      ...config,
      accessToken: token.access_token ?? config.accessToken,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    };
  }

  private async ensureAccessToken(config: HealthProviderConfig): Promise<string> {
    let token = config.accessToken;
    if (!token) throw new Error("No access token. Authenticate first.");
    if (config.expiresAt && Date.now() > config.expiresAt && config.refreshToken) {
      const refreshed = await this.refreshAccessToken(config);
      token = refreshed.accessToken;
    }
    return token!;
  }

  private async listDataPoints(config: HealthProviderConfig, dataType: string, filter?: string): Promise<GoogleDataPoint[]> {
    const token = await this.ensureAccessToken(config);
    const url = new URL(`${GOOGLE_HEALTH_API_BASE}/${dataType}/dataPoints`);
    url.searchParams.set("page_size", "100");
    if (filter) url.searchParams.set("filter", filter);
    const res = await googleFetch<{ dataPoints?: GoogleDataPoint[] }>(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    return res.dataPoints ?? [];
  }

  async fetchLatestVitals(config: HealthProviderConfig): Promise<HealthProviderVitals> {
    if (this.isDemo(config)) return mockVitals();
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const windowFilter = (field: string) => `${field} >= "${toIso(start)}"`;

    const [hrPoints, stepsPoints, sleepPoints, weightPoints, spo2Points, rhrPoints, respPoints] = await Promise.allSettled([
      this.listDataPoints(config, "heart-rate", windowFilter("heartRate.interval.start_time")),
      this.listDataPoints(config, "steps", windowFilter("steps.interval.start_time")),
      this.listDataPoints(config, "sleep", `sleep.interval.end_time >= "${toIso(start)}"`),
      this.listDataPoints(config, "weight", windowFilter("weight.interval.start_time")),
      this.listDataPoints(config, "oxygen-saturation", windowFilter("oxygenSaturation.interval.start_time")),
      this.listDataPoints(config, "daily-resting-heart-rate", windowFilter("dailyRestingHeartRate.interval.start_time")),
      this.listDataPoints(config, "respiratory-rate", windowFilter("respiratoryRate.interval.start_time")),
    ]);

    const value = <T,>(r: PromiseSettledResult<T>): T => (r.status === "fulfilled" ? r.value : ([] as unknown as T));

    const hr = value(hrPoints);
    const steps = value(stepsPoints);
    const sleep = value(sleepPoints);
    const weight = value(weightPoints);
    const spo2 = value(spo2Points);
    const rhr = value(rhrPoints);
    const resp = value(respPoints);

    const vitals: HealthProviderVitals = {};

    const hrBpm = latestNumeric(hr, (p) => (p as any).heartRate?.bpm);
    const resting = latestNumeric(rhr, (p) => (p as any).dailyRestingHeartRate?.value);
    if (hrBpm != null) vitals.heartRate = Math.round(hrBpm);
    else if (resting != null) vitals.heartRate = Math.round(resting);

    const stepCount = latestNumeric(steps, (p) => (p as any).steps?.count);
    if (stepCount != null) vitals.steps = Math.round(stepCount);

    const sleepH = sleepHoursFromSleepPoints(sleep);
    if (sleepH != null) vitals.sleepHours = sleepH;

    const weightVal = latestNumeric(weight, (p) => (p as any).weight?.value);
    if (weightVal != null) vitals.weight = weightVal;

    const spo2Val = latestNumeric(spo2, (p) => (p as any).oxygenSaturation?.value);
    if (spo2Val != null) vitals.oxygenSaturation = Math.round(spo2Val);

    const respVal = latestNumeric(resp, (p) => (p as any).respiratoryRate?.value);
    if (respVal != null) vitals.respiratoryRate = Math.round(respVal);

    return vitals;
  }

  async fetchVitalsHistory(config: HealthProviderConfig, from: Date, to: Date): Promise<HealthProviderVitals[]> {
    if (this.isDemo(config)) return mockVitalsHistory(from, to);
    const dayCount = Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    if (dayCount <= 0) return [];
    const days = Math.min(dayCount, 90);

    const stepsPoints = await this.listDataPoints(
      config,
      "steps",
      `steps.interval.start_time >= "${toIso(from)}" AND steps.interval.start_time < "${toIso(to)}"`,
    );
    const sleepPoints = await this.listDataPoints(
      config,
      "sleep",
      `sleep.interval.end_time >= "${toIso(from)}" AND sleep.interval.end_time < "${toIso(to)}"`,
    );

    const dayMap = new Map<string, HealthProviderVitals>();
    for (const p of stepsPoints as any[]) {
      const day = p?.steps?.interval?.startTime?.slice(0, 10);
      const count = num(p?.steps?.count);
      if (day && count != null) {
        const entry = dayMap.get(day) ?? { steps: 0 };
        entry.steps = (entry.steps ?? 0) + Math.round(count);
        dayMap.set(day, entry);
      }
    }
    for (const p of sleepPoints as any[]) {
      const day = p?.sleep?.interval?.endTime?.slice(0, 10);
      const start = p?.sleep?.interval?.startTime;
      const end = p?.sleep?.interval?.endTime;
      if (day && start && end) {
        const hours = Math.round(((new Date(end).getTime() - new Date(start).getTime()) / 3_600_000) * 10) / 10;
        const entry = dayMap.get(day) ?? {};
        entry.sleepHours = (entry.sleepHours ?? 0) + hours;
        dayMap.set(day, entry);
      }
    }

    const history: HealthProviderVitals[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const entry = dayMap.get(key);
      if (entry) {
        history.push({ ...entry, heartRate: undefined, systolic: undefined, diastolic: undefined });
      }
    }
    return history;
  }
}

class FitbitProvider implements HealthProvider {
  readonly name = "fitbit";
  readonly displayName = "Fitbit";

  private getCredentials(): { clientId: string; clientSecret: string } | null {
    const clientId = process.env.FITBIT_CLIENT_ID?.trim();
    const clientSecret = process.env.FITBIT_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }

  isConnected(config: HealthProviderConfig): boolean {
    return !!(config.accessToken || config.refreshToken);
  }

  connectUrl(redirectUri: string): string {
    const creds = this.getCredentials();
    if (!creds) throw new Error("Fitbit is not configured. Set FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET.");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      scope: "activity heartrate sleep weight respiratory_rate temperature oxygen_saturation",
      expires_in: "604800",
    });
    return `https://www.fitbit.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<HealthProviderConfig> {
    const creds = this.getCredentials();
    if (!creds) throw new Error("Fitbit not configured");
    const body = new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const res = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}` },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Fitbit token exchange failed: ${res.status}`);
    const data = await res.json() as any;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scopes: data.scope?.split(" "),
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };
  }

  async refreshAccessToken(config: HealthProviderConfig): Promise<HealthProviderConfig> {
    const creds = this.getCredentials();
    if (!creds || !config.refreshToken) return config;
    const body = new URLSearchParams({
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}` },
      body: body.toString(),
    });
    if (!res.ok) return config;
    const data = await res.json() as any;
    return { ...config, accessToken: data.access_token, refreshToken: data.refresh_token ?? config.refreshToken, expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : config.expiresAt };
  }

  private async ensureToken(config: HealthProviderConfig): Promise<string> {
    let token = config.accessToken;
    if (!token) throw new Error("Not connected");
    if (config.expiresAt && Date.now() > config.expiresAt && config.refreshToken) {
      const refreshed = await this.refreshAccessToken(config);
      token = refreshed.accessToken;
    }
    return token!;
  }

  private async fitbitFetch<T>(url: string, token: string): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Fitbit API ${res.status}`);
    return res.json() as Promise<T>;
  }

  async fetchLatestVitals(config: HealthProviderConfig): Promise<HealthProviderVitals> {
    const token = await this.ensureToken(config);
    const today = new Date().toISOString().slice(0, 10);
    const vitals: HealthProviderVitals = {};

    try {
      const hr = await this.fitbitFetch<any>(`https://api.fitbit.com/1/user/-/activities/heart/date/${today}/1d.json`, token);
      const rhr = hr?.["activities-heart"]?.[0]?.value?.restingHeartRate;
      if (rhr) vitals.heartRate = rhr;
    } catch {}

    try {
      const sleep = await this.fitbitFetch<any>(`https://api.fitbit.com/1.2/user/-/sleep/date/${today}.json`, token);
      const mins = sleep?.summary?.totalMinutesAsleep;
      if (mins) vitals.sleepHours = Math.round((mins / 60) * 10) / 10;
    } catch {}

    try {
      const act = await this.fitbitFetch<any>(`https://api.fitbit.com/1/user/-/activities/date/${today}.json`, token);
      const steps = act?.summary?.steps;
      if (steps) vitals.steps = steps;
      const cal = act?.summary?.caloriesOut;
      if (cal) vitals.caloriesBurned = cal;
    } catch {}

    try {
      const temp = await this.fitbitFetch<any>(`https://api.fitbit.com/1/user/-/temp/date/${today}.json`, token);
      const val = temp?.temp?.[0]?.value;
      if (val) vitals.temperature = val;
    } catch {}

    try {
      const spo2 = await this.fitbitFetch<any>(`https://api.fitbit.com/1/user/-/spo2/date/${today}.json`, token);
      const val = spo2?.value;
      if (val) vitals.oxygenSaturation = Math.round(val);
    } catch {}

    try {
      const resp = await this.fitbitFetch<any>(`https://api.fitbit.com/1/user/-/br/date/${today}.json`, token);
      const val = resp?.br?.[0]?.value?.breathingRate;
      if (val) vitals.respiratoryRate = Math.round(val);
    } catch {}

    try {
      const wt = await this.fitbitFetch<any>(`https://api.fitbit.com/1/user/-/body/log/weight/date/${today}.json`, token);
      const w = wt?.weight?.[0]?.weight;
      if (w) vitals.weight = w;
    } catch {}

    return vitals;
  }

  async fetchVitalsHistory(config: HealthProviderConfig, from: Date, to: Date): Promise<HealthProviderVitals[]> {
    const token = await this.ensureToken(config);
    const days = Math.min(Math.floor((to.getTime() - from.getTime()) / 86400000), 90);
    const history: HealthProviderVitals[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const entry: HealthProviderVitals = {};
      try {
        const hr = await this.fitbitFetch<any>(`https://api.fitbit.com/1/user/-/activities/heart/date/${dateStr}/1d.json`, token);
        const rhr = hr?.["activities-heart"]?.[0]?.value?.restingHeartRate;
        if (rhr) entry.heartRate = rhr;
      } catch {}
      try {
        const sleep = await this.fitbitFetch<any>(`https://api.fitbit.com/1.2/user/-/sleep/date/${dateStr}.json`, token);
        const mins = sleep?.summary?.totalMinutesAsleep;
        if (mins) entry.sleepHours = Math.round((mins / 60) * 10) / 10;
      } catch {}
      try {
        const act = await this.fitbitFetch<any>(`https://api.fitbit.com/1/user/-/activities/date/${dateStr}.json`, token);
        if (act?.summary?.steps) entry.steps = act.summary.steps;
      } catch {}
      history.push(entry);
    }
    return history;
  }
}

class GoogleFitProvider implements HealthProvider {
  readonly name = "google_fit";
  readonly displayName = "Google Fit";

  private getCredentials(): { clientId: string; clientSecret: string } | null {
    const clientId = process.env.GOOGLE_FIT_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }

  isConnected(config: HealthProviderConfig): boolean {
    return !!(config.accessToken || config.refreshToken);
  }

  connectUrl(redirectUri: string): string {
    const creds = this.getCredentials();
    if (!creds) throw new Error("Google Fit not configured. Set GOOGLE_FIT_CLIENT_ID and GOOGLE_FIT_CLIENT_SECRET.");
    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.heart_rate.read https://www.googleapis.com/auth/fitness.body.read https://www.googleapis.com/auth/fitness.sleep.read https://www.googleapis.com/auth/fitness.blood_oxygen.read https://www.googleapis.com/auth/fitness.blood_glucose.read https://www.googleapis.com/auth/fitness.body.temperature.read https://www.googleapis.com/auth/fitness.oxygen_saturation.read",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<HealthProviderConfig> {
    const creds = this.getCredentials();
    if (!creds) throw new Error("Google Fit not configured");
    const body = new URLSearchParams({
      code, client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Google Fit token exchange failed: ${res.status}`);
    const data = await res.json() as any;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };
  }

  async refreshAccessToken(config: HealthProviderConfig): Promise<HealthProviderConfig> {
    const creds = this.getCredentials();
    if (!creds || !config.refreshToken) return config;
    const body = new URLSearchParams({
      refresh_token: config.refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: "refresh_token",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return config;
    const data = await res.json() as any;
    return { ...config, accessToken: data.access_token, expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : config.expiresAt };
  }

  private async ensureToken(config: HealthProviderConfig): Promise<string> {
    let token = config.accessToken;
    if (!token) throw new Error("Not connected");
    if (config.expiresAt && Date.now() > config.expiresAt && config.refreshToken) {
      const refreshed = await this.refreshAccessToken(config);
      token = refreshed.accessToken;
    }
    return token!;
  }

  private async aggregateRequest(token: string, body: any): Promise<any> {
    const res = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google Fit API ${res.status}`);
    return res.json();
  }

  async fetchLatestVitals(config: HealthProviderConfig): Promise<HealthProviderVitals> {
    const token = await this.ensureToken(config);
    const now = Date.now();
    const dayAgo = now - 86400000;
    const vitals: HealthProviderVitals = {};

    try {
      const data = await this.aggregateRequest(token, {
        aggregateBy: [{ dataTypeName: "com.google.heart_rate.bpm" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: dayAgo,
        endTimeMillis: now,
      });
      const pts = data.bucket?.[0]?.dataset?.[0]?.point ?? [];
      if (pts.length > 0) {
        const latest = pts[pts.length - 1];
        vitals.heartRate = Math.round(latest.value?.[0]?.fpVal ?? latest.value?.[0]?.intVal ?? 0);
      }
    } catch {}

    try {
      const data = await this.aggregateRequest(token, {
        aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: dayAgo,
        endTimeMillis: now,
      });
      const pts = data.bucket?.[0]?.dataset?.[0]?.point ?? [];
      if (pts.length > 0) vitals.steps = pts[0].value?.[0]?.intVal;
    } catch {}

    try {
      const data = await this.aggregateRequest(token, {
        aggregateBy: [{ dataTypeName: "com.google.body.temperature" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: dayAgo,
        endTimeMillis: now,
      });
      const pts = data.bucket?.[0]?.dataset?.[0]?.point ?? [];
      if (pts.length > 0) vitals.temperature = pts[0].value?.[0]?.fpVal;
    } catch {}

    try {
      const data = await this.aggregateRequest(token, {
        aggregateBy: [{ dataTypeName: "com.google.oxygen_saturation" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: dayAgo,
        endTimeMillis: now,
      });
      const pts = data.bucket?.[0]?.dataset?.[0]?.point ?? [];
      if (pts.length > 0) vitals.oxygenSaturation = Math.round((pts[0].value?.[0]?.fpVal ?? 0) * 100);
    } catch {}

    try {
      const data = await this.aggregateRequest(token, {
        aggregateBy: [{ dataTypeName: "com.google.blood_glucose" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: dayAgo,
        endTimeMillis: now,
      });
      const pts = data.bucket?.[0]?.dataset?.[0]?.point ?? [];
      if (pts.length > 0) vitals.bloodGlucose = pts[0].value?.[0]?.fpVal;
    } catch {}

    try {
      const data = await this.aggregateRequest(token, {
        aggregateBy: [{ dataTypeName: "com.google.body.fat.percentage" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: dayAgo,
        endTimeMillis: now,
      });
      const pts = data.bucket?.[0]?.dataset?.[0]?.point ?? [];
      if (pts.length > 0) vitals.weight = pts[0].value?.[0]?.fpVal;
    } catch {}

    return vitals;
  }

  async fetchVitalsHistory(config: HealthProviderConfig, from: Date, to: Date): Promise<HealthProviderVitals[]> {
    const token = await this.ensureToken(config);
    const days = Math.min(Math.floor((to.getTime() - from.getTime()) / 86400000), 90);
    const history: HealthProviderVitals[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      const start = d.getTime();
      const end = start + 86400000;
      const entry: HealthProviderVitals = {};
      try {
        const data = await this.aggregateRequest(token, {
          aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: start, endTimeMillis: end,
        });
        const pts = data.bucket?.[0]?.dataset?.[0]?.point ?? [];
        if (pts.length > 0) entry.steps = pts[0].value?.[0]?.intVal;
      } catch {}
      history.push(entry);
    }
    return history;
  }
}

class AppleHealthProvider extends MockHealthProvider {
  constructor() { super("apple_health", "Apple Health"); }
}

class GarminProvider extends MockHealthProvider {
  constructor() { super("garmin", "Garmin"); }
}

class SamsungHealthProvider extends MockHealthProvider {
  constructor() { super("samsung_health", "Samsung Health"); }
}

const googleHealth = new GoogleHealthProvider();
const googleFit = new GoogleFitProvider();

const providers: Record<string, HealthProvider> = {
  google_health: googleHealth,
  google_fit: googleFit,
  apple_health: new AppleHealthProvider(),
  fitbit: new FitbitProvider(),
  garmin: new GarminProvider(),
  samsung_health: new SamsungHealthProvider(),
};

export function getProvider(name: string): HealthProvider | undefined {
  return providers[name];
}

export function getAllProviders(): HealthProvider[] {
  const seen = new Set<HealthProvider>();
  for (const p of Object.values(providers)) seen.add(p);
  return Array.from(seen);
}

export { providers };
