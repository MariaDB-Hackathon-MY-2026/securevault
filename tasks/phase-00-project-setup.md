# Phase 0 — Project Setup & Configuration

> **Objective:** Bootstrap the Next.js project, install all dependencies, configure environment, and establish the project folder structure.

**Depends on:** Nothing  
**Blueprint ref:** Sections 1 (Tech Stack), 9 (Project Structure), 10 (Deployment)

---

## Tasks

- [ ] **0.1 — Initialize Next.js project**
  - `npx -y create-next-app@latest ./ --typescript --tailwind --eslint --app --src-dir`
  - Verify `src/app/page.tsx` renders

- [ ] **0.2 — Install core dependencies**
  - `npm install drizzle-orm mysql2 @aws-sdk/client-s3 nanoid argon2 sharp`
  - `npm install -D drizzle-kit vitest @types/node`
  - `npm install @tanstack/react-query zxcvbn @zxcvbn-ts/core`
  - `npm install @upstash/ratelimit @upstash/redis`

- [ ] **0.3 — Install UI dependencies**
  - `npx shadcn@latest init` → configure with `src/` and `app/` directory
  - Add core shadcn components: button, input, dialog, dropdown-menu, toast, card, badge, progress, skeleton, alert-dialog

- [ ] **0.4 — Create `.env.local` template**
  - Create `.env.example` with all required env vars from Section 10:
    - `DATABASE_URL`, `MASTER_ENCRYPTION_KEY`, `R2_*` vars, `OPENAI_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - Populate `.env.local` with dev values (Railway DB, R2 test bucket)

- [ ] **0.5 — Create project folder structure**
  - Create all directories from Section 9:
    - `src/lib/crypto/`, `src/lib/auth/`, `src/lib/storage/`, `src/lib/db/`, `src/lib/ai/`, `src/lib/email/`
    - `src/components/ui/`, `src/components/file-explorer/`, `src/components/upload/`, `src/components/share/`, `src/components/chat/`
    - `src/hooks/`
    - `src/app/(auth)/login/`, `src/app/(auth)/signup/`
    - `src/app/(dashboard)/files/`, `src/app/(dashboard)/shared/`, `src/app/(dashboard)/settings/`, `src/app/(dashboard)/chat/`
    - `src/app/s/[token]/`
    - `src/app/api/upload/`, `src/app/api/files/`, `src/app/api/share/`, `src/app/api/chat/`

- [ ] **0.6 — Configure `next.config.ts`**
  - Add security headers from Section 11: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy`

- [ ] **0.7 — Verify R2 bucket is private**
  - Confirm no public access policy on the R2 bucket
  - Confirm no custom domain mappings
  - Access only via S3-compatible API with `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`

- [ ] **0.8 — Configure Drizzle**
  - Create `drizzle.config.ts` pointing at `DATABASE_URL`
  - Dialect: `mysql`

- [ ] **0.9 — Configure Vitest**
  - Create `vitest.config.ts` with path aliases matching `tsconfig.json`
  - Create `tests/` directory with placeholder test

- [ ] **0.10 — Configure TanStack Query provider**
  - Create `src/app/providers.tsx` with `QueryClientProvider`
  - Wrap `layout.tsx` with providers

- [ ] **0.11 — Create custom error pages**
  - `src/app/not-found.tsx` — clean 404 page
  - `src/app/error.tsx` — unhandled runtime error with "try again" button
  - Both styled with shadcn/ui, responsive for mobile

---

## Deliverables

| Output                     | Location                                     |
| -------------------------- | -------------------------------------------- |
| Running Next.js dev server | `npm run dev` → `localhost:3000`             |
| All directories created    | `src/lib/*`, `src/components/*`, `src/app/*` |
| Security headers active    | Response headers include CSP, X-Frame, etc.  |
| Vitest runs                | `npx vitest run` passes placeholder test     |
| Drizzle config ready       | `drizzle.config.ts` exists                   |

---

## Testing

### Automated

```bash
# Dev server starts without errors
npm run dev

# Vitest placeholder passes
npx vitest run

# TypeScript compiles clean
npx tsc --noEmit
```

### Manual Verification

1. Open `http://localhost:3000` — see default Next.js page
2. Inspect response headers in DevTools → Network tab → verify security headers present
3. Verify `.env.local` is in `.gitignore`
