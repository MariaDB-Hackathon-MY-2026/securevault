# Phase 18 — Deployment & Final QA

> **Objective:** Deploy to Vercel, run full security checklist, and validate everything end-to-end.

**Depends on:** All previous phases  
**Blueprint ref:** Sections 10 (Deployment), 21 (Timezone), 22 (Security Testing)

---

## Tasks

- [ ] **18.1 — Configure Vercel project**
  - Create `vercel.json` with cron configuration:
    ```json
    { "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 */6 * * *" }] }
    ```
  - Set all env vars in Vercel dashboard
  - Verify Railway MariaDB accessible from Vercel
  - Verify R2 accessible from Vercel

- [ ] **18.2 — Run full test suite**
  - `npx vitest run` — all unit/integration tests pass
  - Address any failures

- [ ] **18.3 — Run E2E security tests (Playwright)**
  - Install: `npm install -D playwright @playwright/test`
  - Tests per Section 22:
    - Link revocation: create → access → revoke → access (404)
    - OTP brute force: 3 wrong attempts → lockout
    - Reset token reuse: use → reuse (fails)

- [ ] **18.4 — Manual pre-deployment checklist**
  - [ ] Cookie flags: HttpOnly, Secure (production), SameSite=Strict, `__Secure-` prefixed
  - [ ] Security headers: scan with securityheaders.com (A rating)
  - [ ] Quota enforcement: upload > 1GB rejected
  - [ ] Token enumeration: `/s/[random]` returns generic 404
  - [ ] All dates stored/compared in UTC

- [ ] **18.5 — Production build test**
  - `npm run build` — no errors
  - `npm start` — production server works locally

- [ ] **18.6 — Deploy to Vercel**
  - Push to main → Vercel auto-deploys
  - Verify deployed URL loads correctly
  - Run smoke test on production

---

## Testing

### Full Checklist

1. ✅ Signup → login → upload → download → share → revoke → logout
2. ✅ Password reset end-to-end
3. ✅ OTP sharing flow end-to-end
4. ✅ Rate limiting active on production
5. ✅ Security headers present on production
6. ✅ Encrypted files in R2 (not readable raw)
7. ✅ IDOR: user B cannot access user A's files
8. ✅ Upload > 100MB blocked
9. ✅ Storage quota enforced
