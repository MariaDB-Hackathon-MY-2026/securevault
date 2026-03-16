# Phase 3 — Authentication System

> **Objective:** Build session-based, multi-device auth with Argon2id hashing, refresh tokens, and auth proxy logic.

**Depends on:** Phase 1 (DB schema), Phase 2 (encryption for UEK)  
**Blueprint ref:** Section 5 (Authentication), Section 11 (Security Hardening), Section 20 (IDOR)

---

## Tasks

- [x] **3.1 — Implement password hashing**
  - File: `src/lib/auth/password.ts`
  - `hashPassword(password: string): Promise<string>` — Argon2id
  - `verifyPassword(password: string, hash: string): Promise<boolean>`

- [x] **3.2 — Implement password strength validation**
  - File: `src/lib/auth/password-strength.ts`
  - Use `@zxcvbn-ts/core` — reject score < 3
  - `validatePasswordStrength(password: string): { valid: boolean; feedback: string }`

- [x] **3.3 — Implement session management**
  - File: `src/lib/auth/session.ts`
  - `createSession(userId: string, deviceInfo: DeviceInfo): Promise<{ sessionToken, refreshToken }>`
    | Token Type | Value | Cookie Name (Flags) | Expiry | Purpose |
    | :---------------- | :------------------ | :---------------------------- | :------- | :--------------------------- |
    | **Session token** | nanoid(32) opaque | `__Secure-session` (httpOnly) | 15 min | Authenticate API requests |
    | **Refresh token** | nanoid(32) opaque | `__Secure-refresh` (httpOnly) | 30 days | Silently renew session token |
  - `validateSession(sessionToken: string): Promise<User | null>`
  - `refreshSession(refreshToken: string): Promise<{ sessionToken, refreshToken }>`
  - `deleteSession(sessionId: string): Promise<void>`
  - `deleteAllSessions(userId: string): Promise<void>`

- [x] **3.4 — Implement cookie management**
  - File: `src/lib/auth/cookies.ts`
  - Use **secure httpOnly cookies**. We use the `__Secure-` prefix to explicitly mandate HTTPS (except on `localhost` where browsers make an exception for Secure cookies). The `secure` flag should be set to `true` in production, and also during development for `localhost` to allow `__Secure-` cookies to be set.
  - `setAuthCookies(sessionToken, refreshToken)`:
    - Sets `__Secure-session` cookie: `httpOnly`, `secure: process.env.NODE_ENV === "production" || process.env.NODE_ENV === "development"`, `sameSite=strict`, `path=/`
    - Sets `__Secure-refresh` cookie: same flags, `maxAge` for 30 days
  - `clearAuthCookies()`

- [x] **3.5 — Implement auth proxy**
  - File: `src/proxy.ts`
  - Check `__Secure-session` cookie on protected routes
  - If session expired, attempt auto-refresh using `__Secure-refresh` cookie
  - Protected routes: `/activity/*`, `/files/*`, `/settings/*`, `/trash/*`, `/api/upload/*`, `/api/files/*`, `/api/share/*`, `/api/chat/*`
  - Public routes: `/`, `/login`, `/signup`, `/s/*`, `/api/auth/*`
  - Note: In the latest Next.js version, `proxy.ts` is the new file convention that replaces `middleware.ts`.

- [x] **3.6 — Implement `getCurrentUser` helper**
  - File: `src/lib/auth/get-current-user.ts`
  - Reads session cookie → validates → returns user object with decrypted UEK
  - Also checks `email_verified` flag and returns it in the user object
  - `requireVerifiedUser()` is available so upload, share, and AI routes can reject users where `email_verified === false` as those later-phase routes are added
  - Used by all Server Actions and Route Handlers

- [x] **3.7 — Build Signup page + server action**
  - Page: `src/app/(auth)/signup/page.tsx`
  - Server Action: `src/app/(auth)/signup/actions.ts`
  - Flow: validate email/password → hash password → generate UEK → encrypt UEK with MK → insert user → create session → set cookies → redirect to `/activity`

- [x] **3.8 — Build Login page + server action**
  - Page: `src/app/(auth)/login/page.tsx`
  - Server Action: `src/app/(auth)/login/actions.ts`
  - Flow: find user by email → verify Argon2id hash → create session → record device → set cookies → redirect
  - Same error message for wrong email AND wrong password (anti-enumeration)

- [x] **3.9 — Build Logout server action**
  - Server Action: delete session from DB, clear cookies, redirect to login

- [x] **3.10 — Implement safe redirect utility**
  - File: `src/lib/auth/redirect.ts`
  - `safeRedirect(url: string): string` — reject absolute URLs, `//` prefix, only allow relative paths starting with `/`

- [x] **3.11 — Build dashboard layouts**
  - `src/app/(auth)/layout.tsx` — centered card layout for auth pages
  - `src/app/(dashboard)/layout.tsx` — sidebar/header layout for authenticated views
  - Sidebar navigation: Files, Trash, Activity, Settings
  - **User menu** in sidebar header with user name + logout button
  - **Logout button**: calls logout server action (task 3.9)

- [x] **3.12 — Build settings page**
  - File: `src/app/(dashboard)/settings/page.tsx`
  - **Profile section**: change display name form
  - **Security section**: change password (verify current → hash new → update DB)
  - **Active devices section**: list sessions from DB (device_name, IP, created_at), "Revoke" button per session, "Revoke all other devices"
  - Uses `deleteSession(sessionId)` and `deleteAllSessions(userId)` from session service

- [x] **3.13 — Add loading.tsx and toast provider**
  - Create `src/app/(dashboard)/files/loading.tsx` — skeleton grid
  - Create `src/app/(dashboard)/settings/loading.tsx` — skeleton form
  - Create `src/app/(dashboard)/activity/loading.tsx` — skeleton list
  - Add `<Toaster />` component to root layout for toast notifications

---

## Deliverables

| Output             | Location                         |
| ------------------ | -------------------------------- |
| Password hashing   | `src/lib/auth/password.ts`       |
| Session management | `src/lib/auth/session.ts`        |
| Cookie helpers     | `src/lib/auth/cookies.ts`        |
| Auth proxy         | `src/proxy.ts`                   |
| Login page         | `src/app/(auth)/login/page.tsx`  |
| Signup page        | `src/app/(auth)/signup/page.tsx` |
| Dashboard layout   | `src/app/(dashboard)/layout.tsx` |

---

## Testing

### Automated (Vitest) — `tests/auth/`

```bash
npx vitest run tests/auth
```

| Test                                          | Expected             |
| --------------------------------------------- | -------------------- |
| Hash + verify correct password                | Returns true         |
| Hash + verify wrong password                  | Returns false        |
| Password strength reject weak pw ("12345678") | `valid: false`       |
| Password strength accept strong pw            | `valid: true`        |
| `safeRedirect("/activity")`                   | Returns `/activity`  |
| `safeRedirect("https://evil.com")`            | Returns `/activity`  |
| `safeRedirect("//evil.com")`                  | Returns `/activity`  |
| Unauthenticated request to `/api/files`       | Returns 401          |
| Session token validates correctly             | Returns user         |
| Expired session token                         | Returns null         |

### Manual Verification (Browser)

1. Go to `/signup` → create account → verify redirect to `/activity`
2. Open DevTools → Application → Cookies → verify `__Secure-session` cookie has `HttpOnly`, `SameSite=Strict` (and `Secure` in production)
3. Go to `/login` → login → verify redirect
4. Enter wrong password → verify same error as wrong email
5. Visit `/files` without logging in → verify redirect to `/login`
6. Sign up without verifying email → verify pending-warning UI is shown, and later upload/share/AI routes should use `requireVerifiedUser()`
