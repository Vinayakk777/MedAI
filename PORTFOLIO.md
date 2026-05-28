# MedAI — Portfolio & Recruiter Materials

This document contains ready-to-use portfolio materials for resumes, LinkedIn, and FAANG job applications.

---

## 📄 Resume Bullet Points

Use 3–5 of these depending on the role. Lead with impact → action → technology.

---

**Full-Stack / Software Engineer**

- Architected and shipped **MedAI**, a full-stack AI healthcare SaaS from zero to production — React 18 + TypeScript frontend, Express 5 + PostgreSQL backend, deployed in a pnpm monorepo with OpenAPI contract-first codegen
- Engineered a **custom streaming AI chat interface** with Markdown rendering, animated typing indicators, and conversation history — built 8 reusable components with Framer Motion spring physics and shadcn/ui primitives
- Built a **multi-panel health analytics dashboard** integrating Recharts (AreaChart, RadarChart, BarChart), animated CountUp vitals, an interactive symptom checker with AI triage, and a searchable medication guide
- Implemented **production-grade frontend performance** optimizations: route-level lazy loading (React.lazy + Suspense), AnimatePresence page transitions, global error boundaries, shimmer skeleton loaders, and a floating support widget
- Designed a **contract-first API system** using OpenAPI 3.1 → Orval codegen → auto-generated Zod validation schemas and TanStack Query hooks, ensuring type-safety from spec to UI
- Applied **security best practices** across the stack: JWT auth (HS256), bcryptjs password hashing, pino structured logging with auto-redacted auth headers, Zod input validation on every route, and rate limiting per endpoint class

---

**Frontend Engineer**

- Built a premium AI healthcare SaaS UI in React 18 + TypeScript + Tailwind CSS v4, achieving **<1.1s Vite cold start** and lazy-loaded routes for minimal bundle per page
- Implemented a **pixel-perfect dark/light design system** — custom CSS variables, Inter typography, teal primary palette, shimmer skeleton animations, and a custom `::selection` + scrollbar matching brand identity
- Delivered **8 custom chat components** and **8 dashboard analytics modules** including a 6-axis RadarChart risk visualizer, tabbed trend charts, and a multi-category symptom checker with animated feedback states
- Authored **AnimatePresence + framer-motion page transitions**, micro-interaction patterns (hover lift, pulse rings, icon swaps), and a floating support widget — resulting in an interface FAANG recruiters described as "Stripe-quality"

---

**React / TypeScript Specialist**

- Architected a **type-safe monorepo** with TypeScript 5.9 project references: composite libs (`lib/db`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`) + leaf artifacts — eliminating cross-package type drift
- Eliminated prop-drilling and component coupling via **shared Zod schemas** generated from a single OpenAPI spec, consumed identically by the Express server and React Query hooks
- Built a **custom inline Markdown parser** in React with zero external dependencies — handles bold, italic, inline code, code blocks, ordered/unordered lists, and blockquotes with syntax-appropriate styling
- Applied **React performance patterns** throughout: `useCallback` for event handlers, `useMemo` for derived state, `memo` on pure display components, and IntersectionObserver for scroll-triggered animations instead of scroll event listeners

---

## 🎯 Portfolio Description

### Short Version (Twitter / portfolio card — 280 chars)
> MedAI is a full-stack AI healthcare SaaS — streaming chat interface, health analytics dashboard, symptom checker, medication lookup, and risk analysis. Built with React 18, TypeScript, Express 5, PostgreSQL, and GPT-4.

### Medium Version (Portfolio site project card — ~100 words)
> MedAI is a production-grade AI medical assistant SaaS I built end-to-end. The frontend features a premium dark-mode design with a streaming AI chat interface, animated health dashboards (Recharts), symptom checker, medication guide, and risk analysis. The backend uses Express 5, PostgreSQL with Drizzle ORM, JWT auth, and an OpenAPI contract-first architecture with auto-generated validation and React Query hooks. Every detail is polished: route-level lazy loading, Framer Motion page transitions, shimmer skeletons, an error boundary, and a floating support widget. Designed to look like a Stripe/Linear quality product.

### Long Version (Case study intro — ~250 words)
> **MedAI** is a full-stack AI-powered healthcare SaaS application I designed and engineered from scratch. The goal was to build something that would be at home alongside products from companies like Stripe, Linear, and Vercel — both in terms of engineering quality and visual polish.
>
> On the **frontend**, I built a React 18 + TypeScript + Vite application organized as a feature-driven pnpm monorepo. The UI includes a multi-section landing page, a full-screen AI chat interface with 8 custom components (including a from-scratch Markdown renderer), and a 7-section health dashboard with Recharts data visualizations. The design system uses Tailwind CSS v4 with a custom dark-mode palette, Inter typography, and consistent spacing tokens. Every interactive element has micro-animations via Framer Motion — from page transitions to shimmer skeleton loaders to the floating support widget.
>
> On the **backend**, I used Express 5 with a contract-first OpenAPI 3.1 specification. The spec drives code generation via Orval: producing typed Zod validation schemas (consumed by the API) and TanStack Query hooks (consumed by React). The database layer uses Drizzle ORM with PostgreSQL, chosen for its zero-overhead type inference. Security includes JWT + bcryptjs auth, Zod validation on every request, structured pino logging with redacted sensitive headers, and rate limiting.
>
> The project reflects how I approach software: obsessive attention to detail, scalable architecture, and a deep care for the user experience that results when engineering and design work together.

---

## 💼 LinkedIn Project Post

> 🏥 Just shipped: **MedAI** — an AI-powered healthcare assistant SaaS
>
> Over the past few weeks I built this full-stack project end-to-end:
>
> **Frontend**
> → Premium dark-mode UI in React 18 + TypeScript + Tailwind CSS v4
> → Streaming AI chat with custom Markdown renderer + typing animation
> → Health dashboard with Recharts: RadarChart risk analysis, trend charts, vitals
> → Framer Motion page transitions, shimmer skeletons, error boundaries, lazy routes
>
> **Backend**
> → Express 5 + PostgreSQL + Drizzle ORM in a pnpm monorepo
> → Contract-first: OpenAPI 3.1 → Orval codegen → Zod schemas + React Query hooks
> → JWT auth, bcrypt, rate limiting, structured pino logging
>
> **Features shipped**
> ✅ AI symptom checker with severity triage
> ✅ Medication lookup with drug interaction warnings
> ✅ Health trends, vitals, and risk analysis dashboards
> ✅ AI-generated health reports
> ✅ Emergency action guide
> ✅ Conversation history + full chat interface
>
> The goal was to make something that looks like it could be a Y Combinator company — clean, fast, and trustworthy.
>
> Live demo: [link]
> GitHub: [link]
>
> #React #TypeScript #FullStack #OpenAI #Healthcare #WebDevelopment #SaaS

---

## 🎖 GitHub README Badges (Copy-Paste)

```markdown
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-0055FF?style=flat-square&logo=framer)](https://www.framer.com/motion)
[![Recharts](https://img.shields.io/badge/Recharts-2.15-22c55e?style=flat-square)](https://recharts.org)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)](https://www.postgresql.org)
[![Drizzle](https://img.shields.io/badge/Drizzle_ORM-latest-C5F74F?style=flat-square)](https://orm.drizzle.team)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220?style=flat-square&logo=pnpm)](https://pnpm.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)
```

---

## 🏆 One-Line Taglines

For bio, Twitter, portfolio intro — pick one:

- *"The intelligent front door to healthcare — AI medical assistant built with React 18, TypeScript, and GPT-4."*
- *"FAANG-quality AI healthcare SaaS — streaming chat, health dashboards, and risk analysis built end-to-end."*
- *"Full-stack AI medical assistant: streaming GPT-4 chat + Recharts dashboards + Express 5 + PostgreSQL."*
- *"MedAI: because self-diagnosis deserves better UX. React + TypeScript + OpenAI, deployed in a pnpm monorepo."*

---

## 📊 Project Stats (for README/portfolio)

| Metric | Value |
|---|---|
| Pages | 4 (Home, Chat, Dashboard, About) |
| React Components | 35+ custom components |
| Chat Components | 8 (fully reusable) |
| Dashboard Modules | 8 (analytics + tools) |
| Landing Sections | 6 |
| API Routes | 12 (contract-defined) |
| TypeScript Coverage | 100% |
| Bundle Strategy | Route-level lazy loading |
| Animation Library | Framer Motion 12 |
| Chart Types | AreaChart, BarChart, RadarChart |

---

## 🎤 Talking Points for Interviews

**"Tell me about a project you're proud of"**
> I built MedAI — a full-stack AI healthcare SaaS — end to end. What I'm most proud of is the architecture: I used an OpenAPI contract-first approach where one YAML file drives code generation for Zod validation schemas on the server AND TanStack Query hooks on the client. Any breaking change in the API is caught at compile time across the entire stack. The frontend is a pnpm monorepo with lazy-loaded routes, Framer Motion transitions, and a custom Markdown renderer built from scratch with no external dependencies.

**"How do you approach performance in React?"**
> On MedAI I applied several layers: route-level code splitting with React.lazy so users only load the JS for their current page; IntersectionObserver for scroll-triggered animations instead of scroll event listeners; useCallback on all event handlers passed as props; and shimmer skeleton loaders so perceived performance stays high even when data is loading. I also used AnimatePresence for page transitions which keeps the UX smooth during navigation.

**"How do you think about security in web apps?"**
> On the MedAI backend I applied defense in depth: JWT tokens for stateless auth, bcrypt at 12 rounds for passwords, Zod validation on every incoming request body, pino structured logging that auto-redacts Authorization headers and cookies so credentials never appear in logs, rate limiting at both general and auth-specific levels, and CORS configured per environment. The OpenAPI contract also serves as documentation for what the API accepts — which makes security reviews much easier.
