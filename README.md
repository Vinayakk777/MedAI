# MedAI — Intelligent Healthcare Assistant

<div align="center">

![MedAI](https://img.shields.io/badge/MedAI-v2.0-00b8d9?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0xIDE3aC0ydi02SDh2LTJoM1Y3aDJ2NEgxNnYyaC0zdjZ6Ii8+PC9zdmc+)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-0055FF?style=flat-square&logo=framer)](https://www.framer.com/motion)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**A premium AI-powered healthcare SaaS application** — instant symptom analysis, medication lookup, health dashboards, and evidence-based guidance. Inspired by Stripe, Linear, and Apple design principles.

[**Live Demo →**](https://medai.replit.app) &nbsp;·&nbsp; [Features](#-features) &nbsp;·&nbsp; [Architecture](#-architecture) &nbsp;·&nbsp; [Setup](#-local-development) &nbsp;·&nbsp; [Deploy](#-deployment)

</div>

---

## ✨ Features

### 🏠 Landing Page
- Animated hero with 3D-style health orb and gradient backgrounds
- Stats section with animated counters (10M+ consultations, 98.7% accuracy)
- 6 feature cards with Framer Motion stagger animations
- 6 testimonial cards, trust/compliance badges (HIPAA, SOC 2, FDA)
- Newsletter signup, dark/light theme toggle

### 💬 AI Chat Interface
- Full-screen chat with collapsible sidebar (8 reusable components)
- Custom inline Markdown renderer — bold, italic, code, bullets, blockquotes
- Animated typing indicator with radiating pulse ring
- Conversation history grouped by Today / Yesterday / Last 7 Days
- Quick-action suggestion chips (horizontal-scroll, color-coded by topic)
- Auto-resize textarea, voice-mode UI, file attachment button
- Hover-to-reveal copy and thumbs up/down on AI messages

### 📊 Health Dashboard
- **Health Overview** — 4 animated stat cards with CountUp numbers and trend indicators
- **Health Trends** — Tabbed AreaChart/BarChart (Heart Rate, Blood Pressure, Sleep, Activity)
- **Risk Analysis** — RadarChart across 6 body systems + animated progress bars
- **Vital Signs** — 6 vitals with real-time animated fill bars
- **Symptom Checker** — Multi-select symptom categories → AI severity assessment
- **Medication Guide** — Searchable cards with dosage, interactions, refill warnings
- **AI Health Reports** — Timestamped generated reports with trend scores
- **Emergency Guide** — 3-tier triage (Call 911 / Urgent Care / See Doctor)

### 🔧 Engineering
- Route-level lazy loading (React.lazy + Suspense)
- AnimatePresence page transitions
- Global error boundary with recovery UI
- Shimmer skeleton loaders for all loading states
- Floating support widget on every page
- Fully responsive — mobile, tablet, desktop

---

## 🏗 Architecture

```
medai-monorepo/
├── artifacts/
│   ├── medical-ai/          # React + Vite frontend (port 24185)
│   │   ├── src/
│   │   │   ├── pages/           # Route-level pages (lazy loaded)
│   │   │   │   ├── HomePage.tsx
│   │   │   │   ├── ChatPage.tsx
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   └── AboutPage.tsx
│   │   │   ├── components/
│   │   │   │   ├── chat/        # 8 chat components
│   │   │   │   ├── dashboard/   # 8 dashboard modules
│   │   │   │   ├── sections/    # 6 landing page sections
│   │   │   │   ├── layout/      # Navbar, Footer
│   │   │   │   └── ui/          # shadcn/ui + custom primitives
│   │   │   └── hooks/           # useTheme, custom hooks
│   │   └── vite.config.ts
│   └── api-server/          # Express 5 backend (port 8080)
│       └── src/
│           ├── routes/          # Route handlers by domain
│           ├── middlewares/     # Auth, rate limiting, error handling
│           └── lib/             # Logger, utilities
├── lib/
│   ├── db/                  # Drizzle ORM + PostgreSQL schema
│   ├── api-spec/            # OpenAPI 3.1 contract → codegen
│   ├── api-zod/             # Generated Zod validation schemas
│   └── api-client-react/    # Generated React Query hooks
└── pnpm-workspace.yaml      # Workspace + catalog dependency pins
```

### Request Flow

```
Browser (React SPA)
    │
    ├── Static assets → Vite dev server / CDN (production)
    │
    └── /api/* → Shared reverse proxy (port 80)
                      │
                      └── Express API Server
                                │
                                ├── PostgreSQL (Drizzle ORM)
                                │
                                └── OpenAI API (via Replit proxy)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo manager | pnpm workspaces | Shared deps via catalog, workspace:* refs |
| API contract | OpenAPI 3.1 first → codegen | Single source of truth; Zod + React Query auto-generated |
| ORM | Drizzle ORM | Type-safe, lightweight, zero-overhead SQL |
| Styling | Tailwind CSS v4 | Utility-first, zero-runtime, JIT |
| Animation | Framer Motion | Production-grade spring physics |
| Charts | Recharts | Composable, SVG-based, React-native |
| Auth | JWT + bcryptjs | Stateless, scalable, no session store needed |
| Routing | Wouter | 2.1KB alternative to React Router |

---

## 🛠 Tech Stack

### Frontend
| Package | Version | Purpose |
|---|---|---|
| React | 18 | UI framework |
| TypeScript | 5.9 | Type safety |
| Vite | 7 | Build tool + HMR |
| Tailwind CSS | 4 | Utility-first styling |
| Framer Motion | 12 | Animations |
| Recharts | 2.15 | Data visualizations |
| shadcn/ui | latest | Component primitives |
| Wouter | 3 | Client-side routing |
| TanStack Query | 5 | Server state management |
| Lucide React | latest | Icon system |

### Backend
| Package | Version | Purpose |
|---|---|---|
| Node.js | 24 | Runtime |
| Express | 5 | HTTP framework |
| Drizzle ORM | latest | Type-safe PostgreSQL ORM |
| PostgreSQL | 16 | Primary database |
| Zod | 3 (v4 API) | Runtime validation |
| pino + pino-http | latest | Structured JSON logging |
| jsonwebtoken | 9 | JWT auth tokens |
| bcryptjs | 2 | Password hashing |
| express-rate-limit | 7 | API rate limiting |

---

## 💻 Local Development

### Prerequisites
- Node.js 20+ and pnpm 9+
- PostgreSQL 15+ (or use the Replit built-in DB)

### 1. Clone & Install
```bash
git clone https://github.com/your-username/medai.git
cd medai
pnpm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Fill in your values (see Environment Variables section below)
```

### 3. Database Setup
```bash
# Push schema to your database
pnpm --filter @workspace/db run push
```

### 4. Run Development Servers
```bash
# Terminal 1 — API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend (port 24185)
pnpm --filter @workspace/medical-ai run dev
```

The frontend will be available at `http://localhost:24185`.

### 5. Code Generation (when OpenAPI spec changes)
```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## 🔐 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | JWT signing secret (min 32 chars) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | ✅ (AI features) | OpenAI-compatible base URL |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | ✅ (AI features) | OpenAI API key |
| `NODE_ENV` | ⬜ | `development` or `production` |
| `PORT` | ⬜ | API server port (default: 8080) |
| `LOG_LEVEL` | ⬜ | Pino log level (default: `info`) |

```bash
# .env.example
DATABASE_URL=postgresql://user:password@localhost:5432/medai
SESSION_SECRET=your-super-secret-jwt-key-at-least-32-characters
NODE_ENV=development
PORT=8080
```

---

## 🚀 Deployment

### Option 1: Replit (Recommended — One Click)
This project is optimized for Replit deployment with built-in PostgreSQL.

1. Fork this Replit
2. Set environment variables in the Secrets panel
3. Click **Deploy** → the reverse proxy, HTTPS, and health checks are configured automatically

### Option 2: Vercel (Frontend) + Railway (Backend)

**Frontend — Vercel**
```bash
# vercel.json is pre-configured
vercel deploy --prod
```
Set build settings:
- Framework Preset: `Vite`
- Root Directory: `artifacts/medical-ai`
- Build Command: `pnpm --filter @workspace/medical-ai run build`
- Output Directory: `artifacts/medical-ai/dist`

**Backend — Railway / Render**
```bash
# Build command
pnpm --filter @workspace/api-server run build

# Start command
node artifacts/api-server/dist/index.mjs
```
Add all environment variables from the table above.

**Database — Neon / Supabase / Railway**
```bash
# After provisioning, run migrations
DATABASE_URL=your-url pnpm --filter @workspace/db run push
```

---

## 📡 API Reference

### Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/healthz` | Server health check |

### Authentication *(planned)*
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Create account |
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/auth/me` | Get current user |

### Conversations *(planned)*
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/openai/conversations` | List all conversations |
| `POST` | `/api/openai/conversations` | Create conversation |
| `GET` | `/api/openai/conversations/:id` | Get with messages |
| `DELETE` | `/api/openai/conversations/:id` | Delete conversation |
| `POST` | `/api/openai/conversations/:id/messages` | Send message (SSE stream) |

---

## 🧪 Type Checking

```bash
# Full typecheck (libs first, then leaf packages)
pnpm run typecheck

# Single package
pnpm --filter @workspace/medical-ai run typecheck
pnpm --filter @workspace/api-server run typecheck
```

---

## 📁 Component Map

### Chat Components (`src/components/chat/`)
| Component | Description |
|---|---|
| `ChatMessage` | Message bubble with avatar, copy/feedback on hover |
| `MarkdownContent` | Inline markdown parser (bold, italic, code, bullets, blockquotes) |
| `TypingIndicator` | 3-dot pulse animation with radiating avatar ring |
| `SuggestionChips` | Horizontal-scroll quick-action chips |
| `EmptyState` | Welcome screen with 4 quick-action cards |
| `MessageSkeleton` | Shimmer loading state |
| `ChatInput` | Auto-resize textarea + voice/attach/send buttons |
| `ChatSidebar` | Grouped history, search, hover-delete |

### Dashboard Components (`src/components/dashboard/`)
| Component | Description |
|---|---|
| `HealthOverviewCards` | 4 animated metric cards with CountUp |
| `HealthTrendsChart` | Tabbed AreaChart / BarChart (4 metrics) |
| `RiskAnalysisChart` | RadarChart + animated risk progress bars |
| `VitalsPanel` | 6 vitals with animated fill bars |
| `SymptomCheckerWidget` | Multi-select → AI severity assessment |
| `MedicationLookup` | Searchable cards + expand for interactions |
| `HealthReports` | AI-generated report cards with trends |
| `EmergencySuggestions` | 3-tier triage guide + medical disclaimer |

---

## 🎨 Design System

**Color Palette**
```
Primary (Teal):     hsl(183, 100%, 45%)   #00b8d9
Background (Dark):  hsl(222, 47%, 7%)     #090e1a
Card:               hsl(222, 47%, 9%)     #0d1425
Muted:              hsl(215, 20%, 65%)    #94a3b8
```

**Typography:** Inter (Google Fonts) — 300/400/500/600/700/800

**Radius:** 8px base (`--radius: 0.5rem`) → `rounded-xl` (12px), `rounded-2xl` (16px)

---

## 🔒 Security

- JWT tokens signed with `SESSION_SECRET` (HS256)
- Passwords hashed with bcryptjs (12 rounds)
- Rate limiting: 100 req/15min general, 10 req/15min auth routes
- Authorization headers and cookies auto-redacted from logs (pino)
- Query strings stripped from access logs to prevent token leakage
- CORS configured per environment
- Input validated with Zod on every route (server-side)

---

## 📜 License

MIT © 2026 — Built with ❤️ using Replit

---

<div align="center">
  <sub>MedAI is for informational purposes only. Not a substitute for professional medical advice.</sub>
</div>
