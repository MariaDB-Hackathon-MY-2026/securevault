# Phase 16 — AI Agent _(Stretch Goal)_

> **Objective:** Build an AI-powered file assistant using Vercel AI SDK.

**Depends on:** Phase 5 (Download) — needs file access  
**Blueprint ref:** Section 7 (AI Agent)

> [!NOTE]
> **Not in MVP scope.** Only implement after all core features are stable.

---

## Tasks

- [ ] **16.1 — Set up Vercel AI SDK**
  - `npm install ai @ai-sdk/openai`
  - Route: `src/app/api/chat/route.ts`

- [ ] **16.2 — Implement AI tools**
  - `searchFiles` — query MariaDB by filename
  - `getFileInfo` — return file metadata
  - `summarizeFile` — decrypt + send text/PDF content to LLM
  - `createShareLink` — generate share link

- [ ] **16.3 — Build chat UI**
  - File: `src/app/(dashboard)/chat/page.tsx`
  - Streaming chat interface with `useChat` hook

---

## Testing

| Test                                            | Expected          |
| ----------------------------------------------- | ----------------- |
| Ask "find my tax docs" → returns matching files | Search tool works |
| Ask "share report.pdf" → creates link           | Share tool works  |
