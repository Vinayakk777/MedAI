---
name: OpenAI streaming SSE pattern
description: How the chat SSE streaming is implemented in this app
---

Backend (`conversations.ts`): Sets `Content-Type: text/event-stream`, streams `data: {"content": "token"}\n\n` for each OpenAI chunk, then sends `data: {"done": true, "userMessage": {...}, "aiMessage": {...}}\n\n` after persisting to DB.

Frontend (`ChatPage.tsx`): Uses `fetch` + `res.body.getReader()` + `TextDecoder`. Shows `TypingIndicator` until first token arrives, then appends a streaming AI message to the list and updates it token-by-token. On `done`, swaps optimistic temp IDs for real server-persisted message IDs.

**Why:** Orval-generated React Query hooks can't handle SSE responses, so streaming endpoints use raw `fetch` instead of the generated mutation hooks.

**How to apply:** Any new streaming endpoint should follow this pattern. `useMutation` is fine for non-streaming endpoints; use raw fetch + ReadableStream for SSE.
