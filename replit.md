# MedAI — AI Medical Chatbot

A premium AI-powered healthcare SaaS application. Provides instant health guidance, symptom analysis, medication lookup, and a full analytics dashboard. Designed to Stripe/Linear/Apple quality standards.

## Run & Operate

- `pnpm --filter @workspace/medical-ai run dev` — run the React frontend (Vite, uses `PORT` env var)
- `pnpm --filter @workspace/api-server run dev` — run the Express API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages (libs first, then leaf packages)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes to dev database (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces monorepo, Node.js 24, TypeScript 5.9
- **Frontend:** React 18, Vite 7, Tailwind CSS v4, Framer Motion 12, Recharts 2, shadcn/ui, Wouter, TanStack Query 5, Lucide React
- **Backend:** Express 5, Drizzle ORM, PostgreSQL 16, Zod v4, pino logging
- **API contract:** OpenAPI 3.1 → Orval codegen → Zod schemas + React Query hooks
- **Auth (planned):** JWT (jsonwebtoken), bcryptjs, express-rate-limit
- **Build:** esbuild (CJS bundle for API), Vite (ESM for frontend)

## Where Things Live

- `artifacts/medical-ai/src/pages/` — route-level pages (lazy loaded): HomePage, ChatPage, DashboardPage, AboutPage
- `artifacts/medical-ai/src/components/chat/` — 8 chat components (ChatMessage, ChatInput, ChatSidebar, TypingIndicator, SuggestionChips, EmptyState, MessageSkeleton, MarkdownContent)
- `artifacts/medical-ai/src/components/dashboard/` — 8 dashboard modules (HealthOverviewCards, HealthTrendsChart, RiskAnalysisChart, VitalsPanel, SymptomCheckerWidget, MedicationLookup, HealthReports, EmergencySuggestions)
- `artifacts/medical-ai/src/components/sections/` — 6 landing page sections (Hero, Features, Stats, HowItWorks, Testimonials, Trust)
- `artifacts/medical-ai/src/components/ui/` — primitive components (shadcn/ui + ErrorBoundary, PageTransition, Skeleton, FloatingSupportWidget)
- `artifacts/medical-ai/src/index.css` — design tokens (CSS vars), shimmer animation, scrollbar, focus rings
- `artifacts/api-server/src/routes/` — Express route handlers (health check; auth + chat routes planned)
- `lib/db/src/schema/` — Drizzle table definitions (source of truth for DB schema)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-zod/src/generated/` — generated Zod schemas (do not edit manually)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit manually)

## Architecture Decisions

- **OpenAPI contract-first:** The YAML spec drives codegen for both Zod (server validation) and React Query (client hooks) — breaking API changes are caught at compile time across the full stack
- **Monorepo with composite libs:** `lib/*` packages are TypeScript composite + emit declarations; `artifacts/*` are leaf packages that consume them
- **Wouter over React Router:** 2.1KB vs 50KB+ for simple SPA routing — sufficient for this project's needs
- **AnimatePresence with `mode="wait"`:** Page transitions wait for the current page to fully exit before mounting the next, preventing visual overlap
- **IntersectionObserver for animations:** Scroll-triggered animations use IntersectionObserver instead of scroll event listeners — avoids main-thread jank
- **Custom Markdown renderer:** Built from scratch (no external deps) — parses bold, italic, inline code, code blocks, lists, blockquotes. Avoids importing marked/remark (adds ~40KB)

## Product

**Landing Page:** Animated hero, stats, 6 feature cards, how-it-works steps, 6 testimonials, trust/compliance badges, newsletter signup

**AI Chat Interface:** Full-screen chat with collapsible history sidebar, streaming-style responses, suggestion chips, empty state with quick actions, typing indicator, message copy/feedback

**Health Dashboard:** 4 overview stat cards, health trend charts (Heart Rate / BP / Sleep / Activity), risk analysis RadarChart, vital signs panel, symptom checker, medication guide, AI health reports, emergency triage guide

**Floating Support Widget:** Quick-access button on every page linking to Chat, Dashboard, and Emergency Guide

## User Preferences

- No explicit `import React` — Vite JSX transformer handles it
- No `react-icons/si` — use Lucide React exclusively
- Tailwind CSS only for styling — no inline style except for dynamic values (colors from data)
- Framer Motion for all animations — no CSS `@keyframes` for component animations
- shadcn/ui as the component primitive layer — extend, don't fight it
- Components in feature folders (`chat/`, `dashboard/`, `sections/`) — not a flat components dir
- `data-testid` attributes on all interactive elements
- Always `req.log` inside route handlers, `logger` singleton outside request context

## Gotchas

- **Never use `console.log` in server code** — use `req.log` (route handlers) or `logger` (non-request code)
- **Do not run `pnpm dev` at workspace root** — no root dev script; run per-artifact with `--filter`
- **Verify artifacts with `typecheck`, not `build`** — build needs `PORT` + `BASE_PATH` env vars wired by the workflow
- **AnimatePresence requires a `key` on the Switch** — use `useLocation()` key to trigger exit animations on route change
- **OpenAI via Replit AI Integrations proxy** — `AI_INTEGRATIONS_OPENAI_API_KEY` is a dummy string; `AI_INTEGRATIONS_OPENAI_BASE_URL` is the real config
- **Recharts responsive containers** need an explicit parent height — wrap in a div with `h-[Npx]` or `h-full`
- **Drizzle push vs migrate** — use `push` in development (dev only!); in production use proper migrations

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `README.md` for full project documentation, deployment guides, and API reference
- See `PORTFOLIO.md` for resume bullets, LinkedIn post, and recruiter-ready materials
