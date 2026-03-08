# Phase 15 — Password Reset & Email Verification

> **Objective:** Implement forgot-password flow and email verification for new signups.

**Depends on:** Phase 3 (Auth)  
**Blueprint ref:** Section 12 (Password Reset & Email Verification)

---

## Tasks

- [ ] **15.0 — Build email service** _(extracted from Phase 8.3 — needed here first)_
  - File: `src/lib/email/index.ts`
  - Use Resend API or nodemailer + Gmail SMTP
  - `sendEmail(to, subject, html)` — generic sender
  - `sendOTPEmail(to, code)` — formatted OTP email template (reused by Phase 8)
  - `sendPasswordResetEmail(to, resetUrl)` — for forgot password
  - `sendVerificationEmail(to, verifyUrl)` — for email verification
  - File: `src/lib/email/templates.ts`
  - Responsive HTML email templates (inline CSS, table-based layout)
  - Brand header, clear CTA button, monospace OTP, safety footer
  - Functions: `otpEmailHtml(code)`, `resetEmailHtml(url)`, `verifyEmailHtml(url)`

- [ ] **15.1 — Implement forgot password flow**
  - **Forgot password page**: `src/app/(auth)/forgot-password/page.tsx` — email input form
  - Route: `POST /api/auth/forgot-password` — find user, generate reset token (nanoid + SHA-256 hash), store in DB (1h expiry), send email
  - Always say "If an account exists, we sent a link" (anti-enumeration)
  - **Reset password page**: `src/app/(auth)/reset-password/page.tsx` — token from query param, new password form
  - Route: `POST /api/auth/reset-password` — verify token, hash new password, update, invalidate ALL sessions

- [ ] **15.2 — Implement email verification**
  - On signup: set `email_verified = false`, send verification email with token (24h expiry)
  - Page: `src/app/(auth)/verify-email/page.tsx`
  - Route: `GET /api/auth/verify-email?token=...` → mark verified
  - Unverified users: can login but cannot upload, share, or use AI

- [ ] **15.3 — Use auth token tables (already defined in Phase 1)**
  - `password_reset_tokens` and `email_verification_tokens` tables from `src/lib/db/schema/auth-tokens.ts` (Phase 1, tasks 1.10–1.11)
  - Implement service methods: `createResetToken(userId)`, `validateResetToken(tokenHash)`, `createVerificationToken(userId)`, `validateVerificationToken(tokenHash)`

- [ ] **15.4 — Build "Resend verification" UI**
  - Banner on dashboard for unverified users
  - "Resend verification email" button

---

## Testing

| Test                                                        | Expected          |
| ----------------------------------------------------------- | ----------------- |
| Forgot password → email received with reset link            | Works             |
| Use reset link → change password → old sessions invalidated | All logged out    |
| Use reset link twice → second attempt fails                 | One-time use      |
| Signup → verification email sent                            | Token stored      |
| Click verify link → `email_verified = true`                 | Verified          |
| Unverified user tries to upload → blocked                   | Permission denied |
