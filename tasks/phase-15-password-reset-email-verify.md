# Phase 15 - Password Reset

> **Objective:** Implement an OTP-based forgot-password flow that matches the current SecureVault architecture, reuses the existing share/file-access OTP pattern, and is detailed enough for a junior engineer to implement with low ambiguity.

**Depends on:** Phase 3 (Auth), Phase 12 (Rate Limiting & Security)  
**Scope decision:** Email verification is explicitly out of scope for this phase. New users should be created with `email_verified = true` to avoid delaying delivery of the password-reset flow.

---

## Summary

This phase should not introduce a brand-new auth architecture. The codebase already has an OTP lifecycle for restricted share links, and Phase 15 should follow the same shape for password reset:

- generate a 6-digit OTP
- hash it before storing it
- store expiry, attempt count, and used state
- send in production
- log to terminal in local/dev so the flow can still be exercised when delivery is bypassed
- support resend by generating a new OTP and invalidating older active OTPs only after the new OTP is successfully delivered or logged

This phase has one user-facing flow:

1. **Password reset**
   A logged-out user requests a reset OTP, enters the OTP plus a new password, and all active sessions are invalidated after success.

Email verification is not part of this phase. Existing verification gates can remain in the codebase, but signup should default new users to `email_verified = true`.

---

## Existing Architecture To Reuse

### OTP reference implementation

- `secure-vault/src/lib/sharing/otp-service.ts`
- This is the canonical reference for:
  - OTP generation
  - SHA-256 hashing before persistence
  - expiry checks
  - attempt counting
  - resend semantics
  - marking older OTPs used only after successful new send

### Email delivery and local bypass

- `secure-vault/src/lib/email/index.ts`
- Current behavior already supports local/dev testing by logging OTPs to the terminal instead of relying on external delivery.
- Preserve this behavior for auth OTPs.
- Do not replace this with a separate dev-only mechanism.

### Auth entry points

- `secure-vault/src/app/(auth)/login/actions.ts`
- `secure-vault/src/app/(auth)/signup/actions.ts`
- Login and signup already use server actions.
- New OTP request/reset flows should use route handlers under `secure-vault/src/app/api/auth/...`.

### Existing token table

- `secure-vault/src/lib/db/schema/auth-tokens.ts`
- Use `password_reset_tokens`.
- The existing `token_hash` column can store hashed OTP values.
- This phase must include a schema update that adds `attempt_count` so password-reset OTP behavior can match the existing share OTP lifecycle.

### Existing password/session primitives

- `secure-vault/src/lib/auth/password.ts`
- `secure-vault/src/lib/auth/password-strength.ts`
- `secure-vault/src/lib/auth/session.ts`
- `secure-vault/src/lib/db/crud/user/update-user-password.ts`
- `secure-vault/src/lib/db/index.ts`

These are the existing primitives for hashing passwords, checking password strength, and invalidating sessions. Reuse them instead of inventing parallel auth logic.
However, do not compose the password-reset success path from multiple standalone helpers unless they can all participate in the same database transaction.

---

## Non-Goals

- Do not implement email verification in this phase.
- Do not convert the flow into email magic links.
- Do not introduce a second mail provider or parallel mail abstraction.
- Do not change the core login architecture.
- Do not silently weaken anti-enumeration protections.
- Do not invent temporary in-memory behavior for production-critical OTP state.

---

## Product Decision For Signup

To save development time, signup should create users with `email_verified = true`.

Implementation impact:

- `secure-vault/src/app/(auth)/signup/actions.ts` must continue creating users successfully without any verification follow-up.
- No verification OTP should be requested on signup.
- No `/verify-email` page or `/api/auth/email-verification/*` routes should be added in this phase.
- Existing verification-aware UI may remain, but new accounts should already satisfy those checks.
- The implementation must set `email_verified = true` when creating new users.
- Update the shared user-creation path and the database default together so future insert paths also create verified users unless a later phase intentionally changes that policy.
- Do not rely on a future backfill or a reviewer remembering to change the schema default manually after the feature is merged.

If there are existing unverified users in a shared environment, decide separately whether to backfill them to `email_verified = true`. That backfill is not required to complete this phase unless those users would block QA.

---

## Expected UX

### Password reset

- User visits a forgot-password page.
- User submits email.
- UI always shows a generic success message such as:
  - "If an account exists for that email, a verification code has been sent."
- User proceeds to reset-password page or second step.
- User enters:
  - email
  - 6-digit OTP
  - new password
- On success:
  - password is updated
  - OTP is consumed
  - all existing sessions are invalidated
  - user is asked to log in again

### Resend UX

- Password reset must support resend.
- Resend should reuse the same request endpoint instead of adding special-case business logic.
- In local/dev, resend must continue logging the OTP to the terminal.
- The UI should make it obvious when the user should request a new code:
  - expired code
  - too many failed attempts
  - lost code

---

## Architectural Flow

### Request-reset flow

1. User submits email from the forgot-password page.
2. `POST /api/auth/password-reset/request-otp` validates payload and applies rate limiting.
3. The route normalizes email and looks up the user.
4. If no user exists, return the same generic success response.
5. If the user exists:
   - create a new OTP row in `password_reset_tokens`
   - send the OTP in production or log it locally
   - only after successful send/log, retire older active OTPs for that user
6. Return the same generic success payload regardless of whether the account exists.

### Reset-password flow

1. User submits `email`, `code`, and `newPassword`.
2. `POST /api/auth/password-reset/reset` validates payload and password strength.
3. The service resolves the user by normalized email.
4. The service loads the latest active OTP row for that `user_id`.
5. The service checks:
   - OTP exists
   - OTP is not expired
   - OTP is not used
   - `attempt_count < 3`
   - submitted code matches the stored hash
6. On wrong code:
   - increment `attempt_count`
   - lock the OTP after the third failed attempt
7. On success, one atomic database transaction must:
   - update the user's password hash
   - mark the OTP used
   - delete all active sessions for that user
8. The response instructs the UI to send the user back to login.

---

## Data Flow

### Password reset request

- Input:
  - `email`
- Derived/internal data:
  - normalized email
  - user record
  - raw 6-digit OTP
  - SHA-256 OTP hash
  - expiry timestamp
- Database writes:
  - insert new `password_reset_tokens` row
  - on send/log failure: mark the new row used
  - on resend success: mark older active OTP rows used
- External side effects:
  - log OTP in local/dev
  - send email in production

### Password reset confirm

- Input:
  - `email`
  - `code`
  - `newPassword`
- Derived/internal data:
  - normalized email
  - user record
  - latest active OTP row
  - password-strength validation result
  - new Argon2id password hash
- Database writes on failure:
  - increment `attempt_count` for wrong code
- Database writes on success:
  - update `users.password_hash`
  - set `password_reset_tokens.used_at`
  - delete user rows from `sessions`

---

## Implementation Order

### Step 1 - Extract or create shared auth OTP primitives

- [ ] Add auth-specific OTP helpers under `secure-vault/src/lib/auth/`.
- [ ] Reuse logic from `secure-vault/src/lib/sharing/otp-service.ts` where possible.
- [ ] Avoid duplicating utility logic if a shared helper can be safely extracted.

#### Minimum helper responsibilities

- generate 6-digit OTPs
- hash OTPs with SHA-256
- normalize email addresses
- compute expiry timestamps
- compare OTP hashes with the existing timing-safe comparison helper
- increment attempt counts
- mark OTPs used
- invalidate older active OTPs after successful resend

#### Acceptance criteria

- Auth OTP logic has a clear home under `secure-vault/src/lib/auth/`.
- Behavior matches the share OTP lifecycle closely enough that engineers can reason about both flows the same way.
- The shared helper boundaries make it obvious which operations are safe to call outside a transaction and which must receive a transaction-scoped DB handle.

### Step 2 - Extend email helpers for password-reset OTP delivery

- [ ] Keep `secure-vault/src/lib/email/index.ts` as the single outbound email entry point.
- [ ] Add a password-reset-oriented OTP helper if needed, but route it through the existing email module.
- [ ] Preserve terminal logging in non-production.
- [ ] Ensure logs clearly identify:
  - flow type
  - target email
  - OTP code

#### Acceptance criteria

- In local/dev, password reset OTPs are visible in the server terminal.
- In production, delivery uses the real email path.
- Delivery failure paths are explicit and testable.

### Step 3 - Implement password reset OTP persistence and service logic

- [ ] Use `password_reset_tokens` in `secure-vault/src/lib/db/schema/auth-tokens.ts`.
- [ ] Store hashed OTP in `token_hash`.
- [ ] Add `attempt_count` to `password_reset_tokens` in this phase.
- [ ] Add the corresponding Drizzle migration in this phase.
- [ ] Treat each row like a short-lived OTP record:
  - `user_id`
  - hashed OTP
  - expiry
  - attempt count
  - used state

#### Required concrete decisions

- Use the same core OTP policy as share OTP unless a reviewer explicitly approves a deviation:
  - 6 digits
  - 5 minute TTL
  - 3 max failed attempts per active OTP row
- `attempt_count` must be persisted in the database, not tracked in memory, cookies, or Redis.
- Password reset lookup is by normalized email -> user -> latest active OTP for that `user_id`.
- When resend succeeds, mark any older active reset OTP rows for that same `user_id` as used.
- Reuse the share OTP policy, but do not blindly copy the exact SQL/update sequencing from the share flow if it leaves a sent code unusable when one of the follow-up DB writes fails.

#### Service operations to implement

- request password reset OTP
- validate password reset OTP
- consume password reset OTP
- invalidate prior active reset OTPs after successful resend

#### Acceptance criteria

- A valid reset OTP can be created, resent, verified, and consumed.
- Expired and used OTPs are rejected.
- Locked OTPs are rejected after 3 failed attempts.
- Anti-enumeration is preserved for request endpoints.
- Concurrent reset attempts against the same OTP have a single winner. A code that has been consumed by one successful request cannot also succeed in a racing request.

### Step 4 - Add password reset routes

- [ ] Add `POST /api/auth/password-reset/request-otp`
- [ ] Add `POST /api/auth/password-reset/reset`

#### Request endpoint responsibilities

- normalize email
- apply rate limiting
- look up user by normalized email
- if user exists:
  - generate and persist a new OTP
  - send or log OTP
- if user does not exist:
  - return the same success response anyway
- if user exists but delivery/logging fails:
  - log the operational failure
  - mark the newly-created OTP row used
  - still return the same generic success response
- never reveal whether the email exists
- do not introduce obvious response-shape or timing differences between known and unknown emails beyond normal network jitter
- return one stable success shape for both existing and unknown emails so the UI and tests do not branch on hidden account state

#### Reset endpoint responsibilities

- accept:
  - `email`
  - `code`
  - `newPassword`
- validate payload
- validate password strength with `secure-vault/src/lib/auth/password-strength.ts`
- validate OTP
- hash new password
- update password via existing user CRUD/auth code
- perform password update, OTP consume, and `deleteAllSessions(userId)` as one atomic database transaction
- if the current DB layer cannot support the required transaction, stop implementation and escalate instead of shipping best-effort sequencing
- implement OTP consumption with a transaction-safe pattern that prevents two concurrent requests from both succeeding against the same active OTP row
- if helper functions currently create their own DB connection internally, either add transaction-aware overloads or create password-reset-specific transaction helpers instead of mixing transactional and non-transactional writes
- define and implement the exact JSON response contract below so frontend code does not infer state from ad hoc error strings:
  - `400` validation error:
    - `{ "error": "VALIDATION_ERROR", "message": string, "fieldErrors"?: Record<string, string[]> }`
  - `403` invalid OTP:
    - `{ "error": "OTP_INVALID", "message": "Invalid verification code" }`
  - `403` used OTP:
    - `{ "error": "OTP_USED", "message": "Verification code has already been used. Please request a new verification code." }`
  - `403` expired OTP:
    - `{ "error": "OTP_EXPIRED", "message": "Verification code has expired" }`
  - `403` locked OTP:
    - `{ "error": "OTP_LOCKED", "message": "Too many attempts. Please request a new verification code" }`
  - `200` successful password reset:
    - `{ "success": true, "message": "Password reset successful. Please log in again." }`
- do not collapse invalid, used, expired, and locked OTP states into one generic error contract because the UI needs to guide the user differently for each case

#### Acceptance criteria

- A successful reset invalidates all sessions.
- Wrong email + valid-looking code does not succeed.
- A used OTP cannot be reused.
- The endpoint has an explicit, tested behavior for transaction failure: no partial success where password changes but sessions remain active or OTP remains reusable.
- The implementation does not rely on read-then-write OTP consumption without a lock, conditional update, or equivalent compare-and-set guard.

### Step 5 - Add password reset pages

- [ ] Add `secure-vault/src/app/(auth)/forgot-password/page.tsx`
- [ ] Add `secure-vault/src/app/(auth)/reset-password/page.tsx`
- [ ] Follow the existing auth page style used by:
  - `secure-vault/src/app/(auth)/login/page.tsx`
  - `secure-vault/src/app/(auth)/signup/page.tsx`

#### UI requirements

- request form for email
- reset form for:
  - email
  - OTP code
  - new password
- disabled/loading states
- inline error messages
- generic success message on request
- resend action
- guidance for expired/locked codes

#### Acceptance criteria

- UI state is understandable without reading backend logs.
- A junior engineer can manually verify the whole flow in local/dev using terminal-logged OTPs.

### Step 6 - Update signup to default verified users

- [ ] Update `secure-vault/src/app/(auth)/signup/actions.ts`.
- [ ] Ensure new users are created with `email_verified = true`.
- [ ] Do not add any verification-trigger logic.
- [ ] Keep the rest of the signup flow unchanged.

#### Acceptance criteria

- Signup succeeds without any verification follow-up.
- New users are immediately treated as verified by existing gates.
- The code path explicitly sets verified state at creation time and includes a regression test proving it.

### Step 7 - Extend rate limiting

- [ ] Add dedicated policies in `secure-vault/src/lib/rate-limit.ts` for:
  - password reset OTP request
  - password reset OTP verification/reset
- [ ] Scope keys carefully:
  - by IP for broad throttling
  - by IP + email where appropriate
- [ ] Keep anti-enumeration intact even when rate limited.

#### Acceptance criteria

- Abuse scenarios are throttled without leaking account existence.
- The implementation makes an explicit operational decision for Redis failure in this flow and documents it in code/tests. If the limiter fails open, the PR must call that out as an accepted risk and emit an operational log/alert signal.

---

## File Plan

### Likely new files

- `secure-vault/src/app/(auth)/forgot-password/page.tsx`
- `secure-vault/src/app/(auth)/reset-password/page.tsx`
- `secure-vault/src/app/api/auth/password-reset/request-otp/route.ts`
- `secure-vault/src/app/api/auth/password-reset/reset/route.ts`
- one or more auth OTP service files under `secure-vault/src/lib/auth/`

### Likely existing files to update

- `secure-vault/src/lib/email/index.ts`
- `secure-vault/src/lib/email/templates.ts`
- `secure-vault/src/lib/rate-limit.ts`
- `secure-vault/src/lib/db/schema/auth-tokens.ts`
- `secure-vault/src/app/(auth)/signup/actions.ts`
- `secure-vault/src/lib/db/crud/user/create-user.ts`

### Migration work

- add a Drizzle migration for `attempt_count int not null default 0` on:
  - `password_reset_tokens`
- update the `users.email_verified` default to `true` for this phase so the database default matches the product decision
- add an index that supports the production lookup path of "latest active OTP by user"
  - minimum expectation: a composite index beginning with `user_id` and including the columns used to filter active rows and order by recency
  - the review should reject a migration that leaves the lookup dependent on the current single-column `user_id` index alone

---

## Engineering Notes And Pitfalls

### Anti-enumeration

- Password reset request must return the same response whether the email exists or not.
- Do not expose:
  - "user not found"
  - "email not registered"
  - timing differences that obviously reveal existence

### OTP storage

- Never store raw OTPs in the database.
- Only store hashes.
- Raw OTP should appear only:
  - in-memory during generation/send
  - in the dev/local terminal log
  - in the actual delivered email in production
- Raw OTPs must not appear in production application logs, structured error payloads, analytics events, or API responses.

### Token retention

- Password-reset OTP rows are short-lived operational records.
- Use opportunistic deletion in this phase:
  - whenever a reset OTP is requested for a known user, delete that user's old password-reset rows that are already used or expired beyond the retention window
- Retention window:
  - target retention is 7 days for debugging
  - delete anything older during normal request/resend activity
- Because this phase uses opportunistic cleanup instead of a scheduled job, dormant users' old rows may persist longer than 7 days until the next cleanup-triggering request.
- That tradeoff is acceptable for this phase, but it must be called out explicitly in review rather than implied as a hard upper bound.

### Resend correctness

- Do not invalidate the old active OTP before the new OTP has been successfully delivered or logged.
- Otherwise the user can get locked out if delivery fails mid-request.
- Also avoid a resend implementation that:
  - marks every active OTP as used
  - then re-opens the newest OTP in a later statement
- That pattern is acceptable only if the code proves the re-open step cannot fail independently after the user has already received the new code.

### Session invalidation

- Password reset must invalidate all active sessions, not just the current one.
- This includes sessions on other devices.
- Treat password update, OTP consumption, and session invalidation as one atomic success condition.
- If any part of that atomic block fails, return an error and leave the prior password/OTP/session state unchanged.

### Signup simplification

- Signup is intentionally simplified by defaulting `email_verified = true`.
- Do not leave dead verification hooks in the signup success path.

### Local/dev workflow

- The phase must remain easy to test without a verified email domain.
- Terminal logging is part of the development workflow, not an afterthought.

### Concurrency expectations

- Password reset is an auth-sensitive flow. Do not assume requests arrive one at a time.
- The implementation must define how it behaves when:
  - the user double-submits the reset form
  - two browser tabs submit the same OTP at nearly the same time
  - resend is clicked twice quickly
- The expected outcome is deterministic:
  - at most one successful password reset per OTP
  - the newest successfully delivered OTP is the only valid active OTP
  - a failed resend must not retire the previous still-valid OTP

---

## Definition Of Done

This phase is done only when all of the following are true:

- password reset works end-to-end with OTP
- resend works for password reset
- local/dev terminal logging works for password reset OTP delivery
- new users are created with `email_verified = true`
- rate limits exist for request and reset paths
- unit and integration tests cover the core logic and edge cases
- reviewer-only E2E scenarios are documented and ready to run

---

## Testing Strategy

### 1. Unit tests

Add or update tests under `secure-vault/tests/auth/...` for pure service logic and isolated helpers.

#### Password reset OTP service unit tests

- generates a 6-digit OTP
- hashes OTP before persistence
- normalizes email before querying
- creates an OTP row with correct expiry
- initializes `attempt_count = 0`
- rejects expired OTP
- rejects used OTP
- rejects wrong OTP
- locks after 3 failed attempts
- consumes OTP after success
- invalidates older active OTPs only after successful resend
- does not invalidate the previous OTP when email delivery fails
- handles duplicate resend calls safely
- invalidates all sessions after password reset
- ensures only one concurrent consume succeeds for a single OTP

#### Email helper unit tests

- logs OTP to terminal in non-production
- uses outbound email path in production
- includes correct subject and content markers for the password-reset flow
- surfaces delivery failures

#### Signup unit tests

- new user creation defaults `email_verified = true`
- signup does not attempt verification delivery
- verification-aware gates treat a newly created account as verified without additional mutation

#### Rate-limit unit tests

- request limiter blocks after threshold
- verify/reset limiter blocks after threshold
- generic request response remains generic while rate limited
- Redis-unavailable behavior is explicitly covered for password-reset endpoints

### 2. Route integration tests

Add route tests under `secure-vault/tests/auth/...` for API behavior.

#### Password reset request route

- missing email returns validation error
- existing email returns generic success
- unknown email returns same generic success
- rate limited request returns 429
- delivery failure for an existing account still returns the same generic success payload
- malformed JSON is handled safely
- existing and unknown emails return the same JSON shape
- success payload is exactly:
  - `{ "success": true, "message": "If an account exists for that email, a verification code has been sent." }`
- rate-limit payload is exactly:
  - `{ "message": string }`

#### Password reset reset route

- missing fields returns 400
- weak password is rejected
- invalid OTP is rejected
- expired OTP is rejected
- used OTP is rejected
- locked OTP is rejected
- valid OTP resets password and invalidates sessions
- wrong email + valid OTP does not reset another user
- transaction failure prevents partial success
- concurrent submissions of the same valid OTP do not both succeed
- success and failure payloads match the documented route contract exactly
- invalid, used, expired, and locked OTP states are distinguishable by stable `error` codes

### 3. UI component and page tests

#### Password reset pages

- request form renders correctly
- generic success state appears after submission
- reset form handles loading state
- resend control is visible and usable
- error messages render for invalid code and weak password

### 4. Production-oriented failure tests

- email delivery failure during resend
- password reset OTP requested multiple times quickly
- stale OTP from previous resend attempt
- concurrent verify attempts against the same OTP
- OTP replay after success
- service behavior when Redis rate limiting is unavailable
- service behavior when database update succeeds but email delivery fails
- service behavior when session invalidation fails after password change
- service behavior when the OTP consume/update statement affects 0 rows because another request already consumed it

Expected behavior for the most failure-sensitive cases:

- email delivery failure during password-reset request:
  - return the same generic success payload
  - log the failure
  - retire the just-created OTP row
- database update succeeds but email delivery fails during resend:
  - newly-created OTP is retired
  - previously active OTP remains valid
- session invalidation fails during password reset:
  - the full reset transaction fails
  - password remains unchanged
  - OTP remains unused
- concurrent reset attempts against the same OTP:
  - exactly one request may succeed
  - all others must fail without changing the password a second time

### 5. Manual QA checklist

- sign up a new account
- confirm the account is treated as verified immediately
- request password reset
- confirm reset OTP is logged
- use wrong code
- resend and use the new code
- confirm old code no longer works
- use expired or superseded code if practical
- reset password successfully
- confirm old session no longer works

### 6. E2E test note

E2E coverage for this phase should be prepared, but the actual E2E run should only be executed on the reviewer machine.

The implementing engineer should:

- add or update the E2E spec if needed
- document the expected setup and assertions
- avoid claiming E2E was run unless it was actually run on the reviewer machine

---

## Suggested Deliverables

- OTP-based password reset pages, routes, and services
- resend support for password reset
- terminal logging preserved for local/dev auth OTP delivery
- signup updated to default `email_verified = true`
- comprehensive unit and integration coverage
- reviewer-ready E2E scenarios and execution notes
