# Phase 12 — Rate Limiting & Security Hardening

> **Objective:** Add rate limiting to sensitive endpoints and implement remaining security measures.

**Depends on:** Phase 3 (Auth), Phase 8 (Sharing)  
**Blueprint ref:** Sections 13 (Rate Limiting), 11 (Security Threat Model)

---

## Tasks

- [ ] **12.1 — Set up Upstash Redis for rate limiting**
  - Create free Upstash Redis instance at upstash.com
  - Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `.env.local`
  - File: `src/lib/rate-limit.ts`
  - Use `@upstash/ratelimit` with `Ratelimit.fixedWindow()` per Section 13
  - Create named limiters: `authLimiter`, `uploadLimiter`, `otpLimiter`, `downloadLimiter`

- [ ] **12.2 — Apply rate limits to auth endpoints**
  - Login: 5/15min (IP+email), Signup: 5/1h (IP), Forgot: 3/15min (IP)
  - Return 429 with Retry-After header

- [ ] **12.3 — Apply rate limits to file & share endpoints**
  - Upload: 100/1min (userId), Download: 30/1min (userId/IP), OTP: 3/5min (IP+token)

- [ ] **12.4 — Audit all token comparisons**
  - Replace all `===` on tokens/hashes with `safeCompare()` (timing-safe)

- [ ] **12.5 — Verify security headers**
  - Confirm CSP, X-Frame-Options, nosniff headers in next.config.ts

---

## Testing

| Test                                | Expected            |
| ----------------------------------- | ------------------- |
| 6th login attempt → 429             | Rate limit enforced |
| Window expiry → login works         | Resets correctly    |
| All token checks use `safeCompare`  | Grep confirms       |
| securityheaders.com scan → A rating | Headers correct     |
