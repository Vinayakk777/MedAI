# MediBot-Core — Multimodal Chat Upgrade Report

Date: 2026-08-14

## Overview

The existing AI Medical Chatbot was upgraded into a single unified multimodal chat supporting **text**, **voice input**, **voice output**, **medical image upload/analysis**, **symptom analysis**, and **red-flag triage/escalation**. All existing architecture, auth (Clerk), database (Drizzle + Postgres/Neon), Groq client, SSE streaming, and the wider dashboard/clinician features were preserved. No mock/fake functionality was introduced.

## Features delivered

- **Text chat** (unchanged) — SSE streaming via Groq `llama-3.3-70b-versatile`.
- **Voice input** — browser Web Speech API (`SpeechRecognition`) mic button in the chat input with interim transcript, permission / no-speech / network / unsupported error mapping.
- **Voice output** — browser `speechSynthesis` reading assistant replies with play / pause / resume, speaking equalizer indicator, and one-at-a-time module-wide singleton.
- **Image upload & analysis** — attach up to 6 images, drag-and-drop, client-side compression + progress uploads, secure private storage, vision streaming via Groq `qwen/qwen3.6-27b` with `reasoning_effort: "none"` (no thinking-block leakage).
- **Medical image safety** — dedicated system prompt enforcing "observation ≠ diagnosis", no diagnosis from images alone, limitations, escalation guidance.
- **Symptom analysis + triage** — preserved existing `symptomEngine` / `escalationEngine` / `assessmentEngine` pipelines in the conversation route; multimodal replies also run through the same analysis.
- **Reliability** — attachment ownership validation, rollback of user message + attachment links if the AI call fails, 60 s AI timeout, per-message retry in the UI.

## Backend changes (`artifacts/api-server`)

| File | Change |
|---|---|
| `src/routes/images.ts` | **New.** `POST /api/images` (multipart, ≤6 files / ≤15 MB, MIME + magic-byte validation, sanitized filenames, datetime-prefixed storage) and `GET /api/images/:id` (ownership-checked streaming; images are never statically served). |
| `src/routes/conversations.ts` | Multimodal message POST: attachment ownership check, persisted user message with `attachments` jsonb, vision model selection, streaming response, rollback on failure, timeout abort, model tracking in payloads. |
| `src/lib/imageGuidance.ts` | **New.** Medical image safety system-prompt fragment + prompt builder ("observation ≠ diagnosis"). |
| `src/middlewares/requireAuth.ts` | Dev-only auth bypass via `DEV_AUTH_USER_ID` (active only when `NODE_ENV !== "production"`). |
| `src/routes/index.ts` | Mounts `imagesRouter` (other routers now also wired). |

## Frontend changes (`artifacts/medical-ai`)

| File | Change |
|---|---|
| `src/hooks/use-speech-recognition.ts` | **New.** Mic lifecycle, interim/final transcripts, error mapping. |
| `src/hooks/use-speech-synthesis.ts` | **New.** Module-singleton play/pause/resume/stop with Chrome keep-alive timer + `stopAllSpeech()`. |
| `src/lib/image.ts` | **New.** Client validation, canvas compression (max 1600 px, ~1.5 MB), XHR upload with progress + abort. |
| `src/components/chat/ChatInput.tsx` | Mic button (listening/cancel, interim transcript), attach button, previews + remove, drag-drop, upload progress, disabled states, aria-labels, toasts. |
| `src/components/chat/ChatMessage.tsx` | Attachment thumbnails (load via `/api/images/:id`), speaker button (play/pause/resume, equalizer), copy/feedback, error bubble with retry, `Attachment` type export. |
| `src/pages/ChatPage.tsx` | Pending-attachment flow → `prepareImage` → `uploadImages` (progress) → SSE send; retry reuses the failed user message (dedupe); error toasts; new chat / select / delete unchanged; transcript appended to input (never auto-sent). |

The voice engines under `src/lib/voice/` and the `/ws/voice` WebSocket server are pre-existing workspace modules, preserved.

## Database changes (`lib/db`)

- `messages.attachments` — new `jsonb` column, default `'[]'` (schema: `src/schema/messages.ts`).
- `chat_attachments` — new table (`src/schema/chat_attachments.ts`): `user_id`, `message_id`, `conversation_id`, `storage_key`, `mime_type`, `name`, `size`, `width`, `height`.
- Migration `migrations/2026_08_14_chat_attachments.sql` applied to the live Neon DB (plus runner in `lib/db`).

## Configuration / environment

Required (existing): `DATABASE_URL`, `GROQ_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`.

Optional: `DEV_AUTH_USER_ID` (local development auth bypass — never set in production).

Models: `CHAT_MODEL=llama-3.3-70b-versatile`, `VISION_MODEL=qwen/qwen3.6-27b` (verified data-url + streaming, `reasoning_effort:"none"`).

Voice uses the browser Web Speech API (Chrome/Edge) — no extra keys or servers needed; the existing `/ws/voice` WebSocket engine remains for the older voice mode.

## Verification (all passing)

- Root `pnpm run typecheck` — all packages pass.
- Full root `pnpm run build` — api-server + medical-ai build success (single `index` >500 kB chunk-size warning is pre-existing).
- Backend E2E `artifacts/api-server/e2e_test.mjs` (dev server, `DEV_AUTH_USER_ID=test-e2e-user-1`): create conversation → upload → corrupted PNG rejected → multimodal SSE with image → no thinking-block leakage → persisted attachments → authenticated image fetch (bytes identical) → text-only → image-only → delete conversation. **ALL CHECKS PASSED.**
- Vite dev server compiles all new modules (ChatPage, ChatInput, ChatMessage, hooks, `lib/image`) — HTTP 200.
- Dev servers were left running: API on `:5000`, Vite on `:3000` (`.\start_dev.ps1`).

## Project hygiene

- `.gitignore` now covers `.env`, `.env.*.local`, `*.log`, and `uploads/` (previously only implicit `node_modules`/`dist`).
- Image storage directory (`uploads/chat-images/`) is runtime data, not served statically.
- Regression suite kept at `artifacts/api-server/e2e_test.mjs` (requires a running dev API with `DEV_AUTH_USER_ID`).