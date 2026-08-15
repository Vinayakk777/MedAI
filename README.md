# MediBot-Core — AI-Powered Medical Assistant

<div align="center">

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Groq](https://img.shields.io/badge/Groq-LLM-F55036?style=flat-square&logo=groq)](https://groq.com)
[![Clerk](https://img.shields.io/badge/Clerk-Auth-6C47FF?style=flat-square)](https://clerk.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**An end-to-end AI healthcare SaaS** — streaming symptom consultations, image analysis, medical history, health dashboards, safety guardrails, and clinician tooling.

[**Live Demo →**](https://medibot-core.onrender.com) &nbsp;·&nbsp; [Features](#-features) &nbsp;·&nbsp; [Architecture](#-architecture) &nbsp;·&nbsp; [Local Development](#-local-development) &nbsp;·&nbsp; [Deployment](#-deployment)

</div>

---

## ✨ Features

### 💬 AI Consultation Chat (`/chat`)
- Real-time **SSE streaming** responses from Groq LLMs
- **Multi-modal** — attach photos for AI vision analysis (rash, injuries, etc.)
- Voice input + **text-to-speech** (markdown stripped before reading)
- Conversation history grouped by day, persisted per user
- Custom inline Markdown renderer + animated typing indicator

### 🏥 Health Dashboard (`/dashboard`)
- **Health overview** — score, active conditions, allergies, medications, labs, imaging
- **Vital signs** — trends, analysis, alerts (heart rate, BP, sleep, activity)
- **Medical history** — active vs past conditions, **"Solved"** flow (backed by the `resolved_conditions` table), health timeline
- **Wellness** — goals, reminders, insights, symptom trends, referrals, AI health reports
- **Device sync** — optional Google Health Connect integration (demo mode when unconfigured)

### 🛡️ AI Safety Guardrails
- Multi-validator pipeline (`clinicalSafety`, medication safety, plus regression testing)
- Dangerous-symptom detection with escalation-language awareness (question-form mentions of symptoms are exempt)
- Every response evaluated & logged to `safety_evaluations`; admin **Safety Dashboard** + **Regression Reports**
- Blocked responses are never sent to the patient

### 👩‍⚕️ Clinician Portal (`/clinician`)
- Pending consultation review, care plans, physician notes, FHIR export, alert center

### 📄 Documents & RAG (`/documents`, `/rag-admin`)
- Upload/process medical documents, lab values, medications, trends, image analysis
- Admin RAG ingestion/reindexing of clinical guidelines

### 🧪 Observability
- Prompt versioning, provider comparison, feedback analytics, audit logs

---

## 🏗 Architecture

pnpm-workspace monorepo — one build serves both API and frontend in production.

```
MediBot-Core/
├── artifacts/
│   ├── medical-ai/          # React 19 + Vite frontend
│   │   ├── src/
│   │   │   ├── pages/           # Home, Chat, Dashboard, About, Clinician, Documents, RAG admin
│   │   │   ├── components/      # chat/, dashboard/, clinician/, safety/, observability/, documents/, ui/
│   │   │   └── App.tsx          # ClerkProvider + ErrorBoundary + AnimatedRouter
│   │   └── vite.config.ts       # build.outDir = dist/public, base = BASE_PATH
│   └── api-server/          # Express 5 backend (bundled to dist/index.mjs)
│       ├── src/
│       │   ├── routes/          # conversations, memory, dashboard, wellness, safety, clinician, documents, observability, rag-admin
│       │   ├── lib/             # aiClient, multi-agent, safety/, memoryEngine, storage
│       │   └── app.ts           # clerkMiddleware + serves ../medical-ai/dist/public
│       └── e2e_test.mjs         # end-to-end API test suite
├── lib/
│   └── db/                  # Drizzle ORM schema + migrations
├── start_dev.ps1            # Windows dev launcher (API :5000, frontend :3000)
├── DEPLOY.md                # Free deployment guide (Render + Neon + Groq + Clerk)
└── pnpm-workspace.yaml      # Workspace + supply-chain pinning (minimumReleaseAge)
```

### Request Flow (production)

```
Browser (React SPA served by Express)
    │
    ├── /api/*              → Express API (auth via Clerk)
    │                         ├── PostgreSQL (Neon, Drizzle ORM)
    │                         └── Groq LLMs (streaming SSE)
    └── /api/__clerk/*      → Clerk proxy (frontend API)
```

### AI Model Routing (Groq)

| Purpose | Model |
|---|---|
| Chat / voice text | `openai/gpt-oss-120b` |
| JSON / analysis engines | `openai/gpt-oss-20b` (with `reasoning_effort: low`) |
| Image / vision | `qwen/qwen3.6-27b` |

---

## 🛠 Tech Stack

### Frontend
| Package | Purpose |
|---|---|
| React 19 + TypeScript | UI framework |
| Vite 7 | Build + HMR |
| Tailwind CSS 4 | Styling |
| Framer Motion | Animations |
| Recharts | Charts |
| Wouter | Client-side routing |
| TanStack Query | Server state |
| Clerk (`@clerk/clerk-react`) | Authentication |

### Backend
| Package | Purpose |
|---|---|
| Node 24 + Express 5 | HTTP API |
| Drizzle ORM | Type-safe PostgreSQL |
| Clerk (`@clerk/express`) | JWT auth middleware |
| pino + pino-http | Structured logging |
| zod | Runtime validation |
| SSE | Streaming responses |

### Infrastructure
| Service | Role |
|---|---|
| Render | Hosts API + built SPA (single web service) |
| Neon | PostgreSQL (free tier, pooled) |
| Groq | LLM inference |
| Clerk | Auth (user management, OAuth, SSO) |

---

## 💻 Local Development

### Prerequisites
- Node.js 20+ and pnpm (v11 recommended)
- A `.env` file with the keys below (copy values from Render or ask for them)

### 1. Install
```bash
pnpm install --frozen-lockfile
```

### 2. Start (Windows)
```bash
.\start_dev.ps1
```
- API server → `http://localhost:5000`
- Frontend (Vite) → `http://localhost:3000`
- Health check → `http://localhost:5000/api/healthz`

### 3. Build & run manually
```bash
# Build both workspaces
pnpm run build

# Start the API (serves the built SPA too)
cd artifacts/api-server && pnpm start
```

---

## 🔐 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon/Postgres connection string |
| `GROQ_API_KEY` | ✅ | Groq API key (LLM inference) |
| `CLERK_SECRET_KEY` | ✅ | Clerk secret (`sk_test_...` dev / `sk_live_...` prod) |
| `CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key (backend) |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key (frontend bundle) |
| `PORT` | ⬜ | API port (default `5000`) |
| `BASE_PATH` | ⬜ | URL base path (default `/`) |
| `NODE_ENV` | ⬜ | `development` / `production` |
| `DEV_AUTH_USER_ID` | ⬜ | **Dev-only** auth bypass (never in production) |
| `OPENAI_API_KEY` | ⬜ | Only if using OpenAI embeddings for RAG |
| `GOOGLE_HEALTH_*` | ⬜ | Optional Google Health Connect OAuth |

---

## 🚀 Deployment

Live at **https://medibot-core.onrender.com** — a single Render Web Service that:
1. Builds both workspaces (`artifacts/medical-ai` → `dist/public`, `artifacts/api-server` → `dist/index.mjs`)
2. Starts `node artifacts/api-server/dist/index.mjs`

**Build command (Render):**
```bash
npx --yes pnpm@11.17.0 install --frozen-lockfile && npx --yes pnpm@11.17.0 run build
```
**Start command:** `node artifacts/api-server/dist/index.mjs`

Push to `main` → Render auto-rebuilds. Full guide with env vars, Clerk production setup, and cold-start mitigation (UptimeRobot): **[DEPLOY.md](./DEPLOY.md)**.

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/healthz` | Health check |
| `POST` | `/api/conversations` | Create conversation |
| `POST` | `/api/conversations/:id/messages` | Send message (SSE stream) |
| `GET` | `/api/memory/history-summary` | Aggregated medical history |
| `GET` | `/api/memory/timeline` | Health timeline |
| `POST` | `/api/memory/resolved-conditions` | Mark condition as solved |
| `GET` | `/api/dashboard/overview` | Dashboard overview |
| `GET` | `/api/safety/summary` | Safety evaluation summary |
| `GET` | `/api/wellness/overview` | Wellness score |

All `/api/*` routes require Clerk auth (except `/api/healthz`).

---

## 🧪 Testing & Verification

```bash
# Typecheck both workspaces
pnpm run typecheck

# End-to-end API suite (local API running): image upload, streaming, vision, persistence, delete
node artifacts/api-server/e2e_test.mjs
```

Verified flows: multimodal streaming, image upload/retrieval, text-only streaming, conversation persistence, and the full **Solved / Undo** medical-history flow (regression-tested against the render-crash bug).

---

## 🔒 Security

- Clerk JWT auth on every `/api/*` route (`@clerk/express`)
- Clinical safety pipeline blocks dangerous advice before it reaches patients
- pino logs redact auth headers/query strings
- pnpm `minimumReleaseAge` supply-chain protection
- Secrets stored in env vars — never committed

---

## 📜 License

MIT © 2026

---

<div align="center">
  <sub>MediBot-Core is for informational purposes only. Not a substitute for professional medical advice.</sub>
</div>
