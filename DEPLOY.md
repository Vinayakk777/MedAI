# MediBot-Core — Free Deployment Guide

This guide deploys the **single-instance ~5–10 user** version to production **for free** using:

- **Render** — hosts the Node/Express API **and** the statically-built React frontend (the API serves it from `medical-ai/dist/public`), so only **one** web service is needed.
- **Neon** — free Postgres (existing).
- **Groq** — free LLM API (existing). Models are already migrated off the decommissioned `llama-3.3-70b-versatile`:
  - Chat / voice text → `openai/gpt-oss-120b`
  - JSON/analysis engines → `openai/gpt-oss-20b`
  - Image/vision → `qwen/qwen3.6-27b`
- **Clerk** — free auth (existing dev keys). For a real domain you switch to **production** keys.
- **UptimeRobot** — free pinger that hits your URL every ~5 min so Render free tier never cold-sleeps (no splash/countdown page needed).

All current services are well within free tier limits for a handful of users. The only free-tier gotcha is Render sleeping after ~15 min idle — UptimeRobot solves that.

---

## 1. Architecture (why it's one service)

The API server already hosts the built frontend:

```
artifacts/api-server/src/app.ts:17  frontendDist = ../../medical-ai/dist/public
artifacts/api-server/src/app.ts:67  express.static(frontendDist)   -> serves the React app
artifacts/api-server/src/app.ts:69  /*/*  -> index.html             -> SPA fallback
```

So production serves everything over a **single port** (`PORT`, default 5000). No separate Vite production server, no CDN, no second service.

---

## 2. Prerequisites (do once)

- A GitHub/GitLab repo containing the project.
- Neon database URL (already have).
- Groq API key (already have).
- Clerk application (already have, currently dev keys).
- Render account (free).
- UptimeRobot account (free).

---

## 3. Frontend build outputs to `dist/public` — nothing to change

The API expects the built SPA at `artifacts/medical-ai/dist/public`.

- `artifacts/medical-ai/package.json` → `"build": "vite build --config vite.config.ts"`
- `vite.config.ts` → `build.outDir = dist/public`, `base = BASE_PATH` (set to `/` in production).
- The build reads `PORT` and `BASE_PATH` from env. Both are provided on Render.

So the Render build command must build **both** workspaces:
1. `@workspace/medical-ai` (frontend) → writes `dist/public`
2. `@workspace/api-server` (API) → bundles to `dist/index.mjs`

Then start the API only.

---

## 4. Render Web Service setup

1. **New → Web Service** → connect your repo (or **Blueprint**/Docker if you prefer; plain Web Service works).
2. **Environment**: Node.
   - **Node version** → `22` (set as `NODE_VERSION=22` env var, or set in the service's Node settings).
3. **Build command** (Run this at the repo root):
   ```bash
   npm i -g pnpm && pnpm install --frozen-lockfile && pnpm run build
   ```
   - `pnpm run build` runs `pnpm run typecheck` then `pnpm -r --if-present run build`, building `artifacts/medical-ai` → `dist/public` and `artifacts/api-server` → `dist/index.mjs`.
   - First deploy may be slow (pnpm cache). Later deploys reuse the cache.
4. **Start command**:
   ```bash
   node artifacts/api-server/dist/index.mjs
   ```
   (The API reads `PORT` from Render's injected env, so no `--enable-source-maps` needed in prod; you may add it — harmless.)
5. **Instance type**: **Free** (0.1 CPU / 512 MB RAM). Fine for single-digit users. Your API bundle is ~7 MB on disk / ~250 MB RAM peak — comfortable.

### Environment variables (set in Render → your service → Environment)

| Variable | Value |
|---|---|
| `PORT` | `5000` (Render sets it; leave Render's default if provided) |
| `NODE_ENV` | `production` |
| `BASE_PATH` | `/` |
| `NODE_VERSION` | `22` |
| `DATABASE_URL` | your Neon **pooled** connection string (`?sslmode=require` → use `verify-full` or the Neon-issued URL) |
| `GROQ_API_KEY` | your Groq key |
| `CLERK_SECRET_KEY` | **production** secret key |
| `CLERK_PUBLISHABLE_KEY` | **production** publishable key |
| `VITE_CLERK_PUBLISHABLE_KEY` | the same production publishable key |
| `GOOGLE_HEALTH_CLIENT_ID` | *(optional)* your Google OAuth client ID |
| `GOOGLE_HEALTH_CLIENT_SECRET` | *(optional)* your Google OAuth client secret |
| `GOOGLE_HEALTH_REDIRECT_URI` | *(optional)* `https://<your-app>.onrender.com/dashboard` |
| `DEV_AUTH_USER_ID` | **DO NOT SET** — never set in production. It's a local-only auth bypass guarded by `NODE_ENV !== "production"`. |

> **Important:** Do **not** set `OPENAI_API_KEY`. Embeddings/RAG default to OpenAI with that key; if you have no OpenAI key, RAG embedding creation is unavailable (the rest of the app works). Only set it if you deliberately enable OpenAI embeddings.

> **Important:** The Clerk publishable key is embedded in the frontend bundle, so it's public by design — but make sure you're using the **production** key instance, not dev.

---

## 5. Clerk production setup (before you can sign in on the real domain)

1. Clerk Dashboard → your app → **Domains**.
2. Add your domain: `https://<your-app>.onrender.com`.
   - Remove `localhost` and the replit/dev domain if you want prod-only.
3. Under **API Keys**, ensure you're on the **Production** instance and copy:
   - **Secret key** (`sk_live_...`) → `CLERK_SECRET_KEY`
   - **Publishable key** (`pk_live_...`) → `CLERK_PUBLISHABLE_KEY` **and** `VITE_CLERK_PUBLISHABLE_KEY`
4. If you use Google social login with Clerk, add your render domain to the Google OAuth redirect allowlist too.

> Clerk free tier supports thousands of users — far more than this app needs.

---

## 6. First deploy & verify

After the service deploys:

1. **Health check**: `GET https://<your-app>.onrender.com/api/healthz` → `{"status":"ok"}`.
2. **Homepage**: `https://<your-app>.onrender.com/` → the React SPA loads.
3. **Static SPA routes**: `/chat`, `/dashboard`, `/about`, etc. return the SPA (HTTP 200) thanks to the `/*/*` fallback — **not** 404.
4. **Auth**: sign up / sign in works against Clerk production.
5. **Chat**: send a text message — streams via `openai/gpt-oss-120b`.
6. **Image**: upload a photo — vision analysis streams via `qwen/qwen3.6-27b`.
7. **Dashboard/Medical History**: chat symptoms → they appear under Active Conditions → the **Solved** button moves them to Past (backed by the `resolved_conditions` table).

---

## 7. Database note (Neon)

The production DB already has the schema pushed (including the new `resolved_conditions` table). If you ever switch to a **new** Neon project, run the migration once:

```bash
# from this repo, with DATABASE_URL set:
pnpm --filter @workspace/db run push
```

Keep the free Neon branch/branching simple; pooler recommended for the free tier connection limits.

---

## 8. Cold-start mitigation (UptimeRobot) — prevents Render free sleep

Render free web services sleep after ~15 min without inbound traffic. Wake-up takes ~1 min and free instances have a **monthly limit of 750 instance-hours** (a single always-awake service uses ~744 → just under the cap). To keep it warm, use UptimeRobot:

1. UptimeRobot → **New monitor** → type **HTTP(S)**.
2. URL: `https://<your-app>.onrender.com/api/healthz`
3. Interval: **5 minutes** (fastest free).
4. Create. Now Render sees a request every 5 min → never sleeps.
   - Keep the 5-min pings ≈ **24 pings/hour ≈ 720/month** — well within UptimeRobot's free 50-monitor, and Render's free bandwidth.

> Optional alternative: set `Render` service to **Paid** (~$7/mo) to remove sleep entirely. For a free ~5–10 user version, the UptimeRobot ping is enough.

---

## 9. Redeploying after code changes

Push to the repo branch Render watches → Render auto-rebuilds with the same Build/Start commands. No manual steps.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `healthz` not OK | `NODE_ENV`/`PORT` missing, or `DATABASE_URL` not set / unreachable. Check Render logs. |
| Blank SPA / assets 404 | Frontend not built → confirm `pnpm run build` produced `artifacts/medical-ai/dist/public`. Set `BASE_PATH=/`. |
| Sign-in redirect loop | Clerk domain not added for the render domain, or dev keys still set. Switch to production keys + add domain. |
| Chat returns errors | `GROQ_API_KEY` missing/expired, or free-tier rate limit (30 RPM on GPT-OSS). Retry. |
| Image analysis fails | Vision needs `qwen/qwen3.6-27b`; confirm the model ID is current on Groq (vision models change frequently). |
| Cold-sleep on first click | Normal if UptimeRobot not set up yet. Add the 5-min monitor. |
| `DEV_AUTH_USER_ID` bypass active | It is **never** honored when `NODE_ENV=production` (code guard). Just double-check it's not in the Render env. |

---

## Cost summary (all free)

- **Render** Web Service (free) — limited by 750 instance-hrs/mo (one service fits).
- **Neon** free Postgres — storage/limits fine.
- **Groq** free — generous developer-plan rate limits; ~10 users fine.
- **Clerk** free — thousands of MAU.
- **UptimeRobot** free — 50 monitors.
- **Total: $0/mo.**
