# Phase 12 - Rate Limiting and Security Hardening

> **Objective:** Add production-grade rate limiting to the endpoints that already exist in the codebase, harden remaining secret comparisons, and add Redis-backed global upload concurrency control that works across tabs, browsers, and devices.

**Depends on:** Phase 3 (Auth), Phase 4 (Upload), Phase 5 (Download), Phase 8 (Sharing)  
**Blueprint ref:** Section 13 (Rate Limiting), Section 11 (Security Threat Model)

---

## Current Implementation Snapshot

This phase needs to match the code that exists today, not the older blueprint wording.

- Auth is currently implemented through server actions:
  - `secure-vault/src/app/(auth)/login/actions.ts`
  - `secure-vault/src/app/(auth)/signup/actions.ts`
- Upload is currently implemented through these route handlers:
  - `secure-vault/src/app/api/upload/init/route.ts`
  - `secure-vault/src/app/api/upload/status/route.ts`
  - `secure-vault/src/app/api/upload/chunk/route.ts`
  - `secure-vault/src/app/api/upload/complete/route.ts`
- The upload queue already exists client-side:
  - `secure-vault/src/lib/upload/upload-job.ts`
  - `secure-vault/src/lib/upload/upload-manager.ts`
- The queue currently enforces `MAX_CONCURRENT_UPLOADS = 3` only inside one browser instance. It does **not** enforce a global per-user limit across multiple tabs or devices.
- Share OTP and share download routes already exist:
  - `secure-vault/src/app/api/share/[token]/request-otp/route.ts`
  - `secure-vault/src/app/api/share/[token]/verify-otp/route.ts`
  - `secure-vault/src/app/api/share/[token]/download/route.ts`
  - `secure-vault/src/app/api/share/[token]/preview/route.ts`
- Owned file download and preview routes already exist:
  - `secure-vault/src/app/api/files/[id]/download/route.ts`
  - `secure-vault/src/app/api/files/[id]/preview/route.ts`
- `safeCompare()` already exists in `secure-vault/src/lib/crypto/timing.ts`, but OTP hash verification still uses direct string equality.
- Security headers are already configured in `secure-vault/next.config.ts`, and there is already a regression test in `secure-vault/tests/download/headers-config.test.ts`.

Because of the above, this phase should focus on:

1. Adding shared Redis and rate-limit infrastructure.
2. Wiring it into the current routes and server actions.
3. Adding a Redis-backed active-upload lease/counter so upload concurrency is enforced globally.
4. Updating the client upload job/manager flow so the UI behaves correctly when a global slot is unavailable.
5. Expanding tests so the behavior is safe to ship.

---

## Architecture Decisions For This Phase

### A. Keep MariaDB as the source of truth for resumable upload sessions

Do **not** replace `upload_sessions` with Redis.

- MariaDB continues to store:
  - `uploadId`
  - `fileId`
  - `completed_chunks`
  - upload completion state
  - expiry window
- Redis is used only for:
  - rate limiting
  - active upload lease/counter tracking

This keeps the resumable upload implementation aligned with the current code and avoids rewriting the existing DB-backed resume flow.

### A1. Redis support must use standard Redis

This phase should use standard Redis reachable over `redis://` from a local Docker container or any self-hosted instance.

That means:

- keep Redis access behind a small adapter layer owned by the repo
- use `REDIS_URL` as the single runtime configuration path

Recommended implementation shape:

- `RedisAdapter` interface in repo code
- `NodeRedisAdapter` for standard Redis using the `redis` npm package

The rest of the app should call repo helpers such as:

- `getRedisAdapter()`
- `enforceRateLimit(...)`
- `claimUploadSlot(...)`
- `refreshUploadSlot(...)`
- `releaseUploadSlot(...)`

This lets local development and production use the same Redis contract.

### B. Separate "upload session exists" from "upload is actively consuming a slot"

Today, `upload_sessions.status = "uploading"` really means "this upload session is open/resumable".

That is acceptable to keep for now, but **global active uploads** must be tracked separately in Redis because:

- a paused browser tab should not hold a slot for 24 hours
- a crashed browser must eventually release the slot automatically
- multiple devices must see the same global limit

### C. Use short-lived Redis leases for active uploads

Use Redis keys with TTL so a slot is released even if the browser disappears without calling a cleanup endpoint.

Recommended model:

- Per-user counter key:
  - `upload:active-count:{userId}`
- Per-upload lease key:
  - `upload:lease:{uploadId}`

Lease payload should minimally include:

- `userId`
- `uploadId`
- `leaseVersion` or simple marker value

Recommended TTL:

- `60s` or `90s`

The lease must be:

- claimed before chunk uploads are allowed
- refreshed while chunks are still flowing
- explicitly released on successful completion
- explicitly released on pause/cancel/failure when possible
- automatically released by TTL if the client vanishes

### D. Make the global upload limit use the same shared constant on client and server

Move the file-level concurrency limit to one shared constant in `secure-vault/src/lib/constants/upload.ts`, for example:

- `MAX_ACTIVE_UPLOADS_PER_USER = 3`

Then update:

- `secure-vault/src/lib/upload/upload-manager.constants.ts`
- the new Redis upload-slot service

This prevents the client scheduler and server enforcement from drifting apart.

### E. Add a dedicated upload slot claim step before chunking starts

Do not rely on `/api/upload/init` alone to mean "upload may now begin".

The `UploadJob` flow should become:

1. `POST /api/upload/init`
2. `GET /api/upload/status`
3. `POST /api/upload/start` to claim or refresh the active-upload lease
4. `POST /api/upload/chunk` for remaining chunks
5. `POST /api/upload/complete`
6. `POST /api/upload/release` as a best-effort cleanup on pause/cancel/failure when needed

Why this is the safest fit for the current implementation:

- `init` can still create or resume a DB session
- global slot enforcement happens right before real upload work begins
- queued jobs can wait for a slot without creating duplicate DB rows
- a repeated `init` for the same file can still reuse the same `uploadId`

### F. Local development must include Docker Redis

This phase should include a local development path that works with local Docker Redis.

Required local-dev setup:

- add a Docker Compose file at the repo root, for example:
  - `compose.yaml`
  - or `docker-compose.dev.yml`
- include a `redis:7-alpine` service
- expose port `6379`
- mount a named volume for persistence
- set `REDIS_URL=redis://127.0.0.1:6379` in local env examples/documentation

Recommended compose service:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - securevault-redis-data:/data
    command: ["redis-server", "--appendonly", "yes"]

volumes:
  securevault-redis-data:
```

Recommended dev scripts:

- `npm run dev:redis` -> `docker compose up redis`
- `npm run dev:redis:stop` -> `docker compose stop redis`

If scripts are added, they should be documented in the repo README as part of this phase.

---

## Tasks

- [ ] **12.1 - Build shared Redis and rate-limit infrastructure**
  - Create a single Redis client module, for example:
    - `secure-vault/src/lib/redis.ts` (new)
  - Create a provider-agnostic adapter layer, for example:
    - `RedisAdapter` interface in `secure-vault/src/lib/redis.ts`
    - `NodeRedisAdapter` using `redis`
  - Add standard Redis env support:
    - `REDIS_URL`
  - Update `secure-vault/.env.example` to document the Redis URL configuration path.
  - Create a shared rate-limit module, for example:
    - `secure-vault/src/lib/rate-limit.ts` (new)
  - Add a small request identity helper so route handlers and server actions use the same IP normalization rules:
    - extend `secure-vault/src/lib/auth/request-metadata.ts`
    - or create `secure-vault/src/lib/auth/request-identity.ts` (new)
  - Important architecture rule:
    - the rate limiter must use generic Redis operations from the adapter layer
  - If a helper needs Lua/eval support for atomicity, the adapter must expose that in a way the repo-owned Redis client can satisfy.
  - Expose named policies that match the endpoints that exist **today**:
    - `loginLimiter`: `5 / 15 min`, key = `ip + normalized email`
    - `signupLimiter`: `5 / 1 hour`, key = `ip`
    - `otpRequestLimiter`: `3 / 15 min`, key = `ip + share token`
    - `otpVerifyLimiter`: `3 / 5 min`, key = `ip + share token`
    - `uploadLimiter`: `100 / 1 min`, key = `userId`
    - `downloadLimiter`: `30 / 1 min`, key = `userId` for owned routes, `ip + share token` for public share routes
  - Standardize the rejection behavior in one helper:
    - status `429`
    - JSON body with a stable message
    - `Retry-After` header
    - include limit metadata headers if available from the Redis-backed helper
  - Important implementation detail:
    - server action call sites should not hand-roll their own 429 formatting
    - route handlers and server actions should share the same helper contract
  - Future-proofing:
    - add a placeholder or helper entry for forgot-password so Phase 15 can wire it in without reworking the rate-limit module
  - Dependency changes expected for this task:
    - add `redis` for local Docker and generic Redis support

- [ ] **12.1.1 - Add local Docker Redis for development**
  - Add a repo-root compose file:
    - `compose.yaml` preferred
  - Add a `redis` service using `redis:7-alpine`
  - Expose port `6379`
  - Enable persistence with a named volume
  - Update local setup docs so a developer can start Redis with one command
  - Add or update npm scripts in `secure-vault/package.json`, for example:
    - `dev:redis`
    - `dev:redis:stop`
  - Update README or local setup docs to say:
    - start Docker Redis
    - set `REDIS_URL=redis://127.0.0.1:6379`
    - run the Next app normally
  - The application should automatically use `REDIS_URL` when present, without requiring code changes between local and production

- [ ] **12.2 - Apply rate limits to the current auth implementation**
  - Files:
    - `secure-vault/src/app/(auth)/login/actions.ts`
    - `secure-vault/src/app/(auth)/signup/actions.ts`
    - tests under `secure-vault/tests/auth/`
  - `loginAction` must rate limit before:
    - DB user lookup
    - password hash verification
    - session creation
  - Use the normalized email that already exists in the action as part of the limiter key.
  - `signupAction` must rate limit before:
    - password hashing
    - user creation
    - session creation
  - Do **not** break the existing action contract.
    - Login and signup currently return `{ error: string }` on failure.
    - Keep that shape for limited responses.
  - Add a stable user-facing message for auth rate limiting, for example:
    - `"Too many attempts. Please try again later."`
  - Make sure the action does not leak whether the email exists.
    - The limiter key can use the normalized email internally.
    - The response still needs to remain generic.

- [ ] **12.3 - Apply rate limits to the current share, upload, and download routes**
  - Files:
    - `secure-vault/src/app/api/share/[token]/request-otp/route.ts`
    - `secure-vault/src/app/api/share/[token]/verify-otp/route.ts`
    - `secure-vault/src/app/api/share/[token]/download/route.ts`
    - `secure-vault/src/app/api/share/[token]/preview/route.ts`
    - `secure-vault/src/app/api/files/[id]/download/route.ts`
    - `secure-vault/src/app/api/files/[id]/preview/route.ts`
    - `secure-vault/src/app/api/upload/init/route.ts`
    - `secure-vault/src/app/api/upload/status/route.ts`
    - `secure-vault/src/app/api/upload/chunk/route.ts`
    - `secure-vault/src/app/api/upload/complete/route.ts`
  - Apply the limiter **before** expensive work:
    - before DB reads that are only needed for the protected operation
    - before streaming from R2
    - before sending OTP email
    - before chunk encryption/upload
  - For upload routes, use the authenticated `user.id` as the key.
  - For owned download and preview routes, use the authenticated `user.id` as the key.
  - For share download and share preview routes, use `ip + token` because unauthenticated access is possible.
  - For OTP request and verify routes, use `ip + token`.
  - Preserve existing response semantics where required:
    - `EMAIL_NOT_ALLOWED` on OTP request must stay generic
    - rate-limited responses should still be explicit `429`
  - Do not let the rate-limit helper double-consume the body stream.
    - In the route handler, rate limit before `request.json()` if the key does not depend on the JSON body.
    - For routes where the key depends on the body, parse once and reuse the parsed payload.

- [ ] **12.4 - Add Redis-backed global upload slot management**
  - Create a dedicated upload concurrency module, for example:
    - `secure-vault/src/lib/upload/upload-concurrency.ts` (new)
  - Create two new route handlers:
    - `secure-vault/src/app/api/upload/start/route.ts` (new)
    - `secure-vault/src/app/api/upload/release/route.ts` (new)
  - `POST /api/upload/start` responsibilities:
    - authenticate the user
    - validate the `uploadId`
    - confirm the upload session belongs to the user and is still resumable
    - atomically claim or refresh the Redis lease
    - return `200` if the slot is available
    - return `429` with `Retry-After` if the user already has the maximum active uploads
  - `POST /api/upload/release` responsibilities:
    - authenticate the user
    - validate the `uploadId`
    - release the lease if it exists
    - never decrement the user counter below zero
    - return success even if the lease already expired, so cleanup is idempotent
  - The Redis operations must be atomic.
    - Do **not** implement claim/release as separate read/then-write calls without atomic protection.
    - Use one Lua script or one guaranteed atomic Redis sequence per operation.
  - Required claim semantics:
    - if `upload:lease:{uploadId}` already exists for the same user, refresh TTL and do **not** increment the user counter again
    - if no lease exists and the count is below max, create the lease and increment the counter
    - if no lease exists and the count is already at max, reject with `429`
  - Required release semantics:
    - if the lease exists, delete it and decrement the counter once
    - if the lease does not exist, treat release as a no-op
    - if the counter becomes `0`, delete the counter key
  - Add a small repair path for stale counters:
    - if the counter says `> 0` but the relevant lease key is gone, the claim/release helper should be able to repair the mismatch instead of leaving the user permanently blocked
  - Keep the TTL short enough that abandoned browsers free slots without manual intervention.

- [ ] **12.5 - Refresh the lease during active chunk uploads**
  - Files:
    - `secure-vault/src/app/api/upload/chunk/route.ts`
    - `secure-vault/src/app/api/upload/chunk/service.ts`
    - `secure-vault/src/app/api/upload/complete/route.ts`
    - `secure-vault/src/app/api/upload/complete/service.ts`
  - Before accepting a chunk, validate that the caller still owns an active lease for that `uploadId`.
  - Refresh the lease TTL on each accepted chunk so long uploads do not lose the slot mid-transfer.
  - If a chunk request arrives without a valid lease:
    - either reacquire when capacity is available
    - or reject with `429`/`409`
  - Pick one behavior and keep it consistent across the service and tests.
  - On successful completion:
    - complete the DB transaction
    - release the Redis lease afterward
  - On completion failure:
    - do not lose DB integrity
    - still attempt lease cleanup in `finally`

- [ ] **12.6 - Update UploadJob and UploadManager to understand global slots**
  - Files:
    - `secure-vault/src/lib/upload/upload-job.ts`
    - `secure-vault/src/lib/upload/upload-manager.ts`
    - `secure-vault/src/lib/upload/upload-manager.constants.ts`
    - `secure-vault/src/lib/upload/upload-job-error.ts`
    - `secure-vault/src/components/upload/upload-dialog.tsx`
    - `secure-vault/src/components/upload/upload-queue-summary.tsx`
    - upload tests under `secure-vault/tests/upload/`
  - Add a new client job status for a slot wait, for example:
    - `waiting_for_slot`
  - The job lifecycle should become:
    - `queued`
    - `waiting_for_slot`
    - `uploading`
    - terminal or paused/cancelled states
  - `UploadJob.start()` should:
    - initialize or resume upload metadata
    - claim the global slot through `/api/upload/start`
    - if the slot is unavailable, transition to `waiting_for_slot`
    - honor `Retry-After`
    - retry instead of marking the job as failed immediately
  - `UploadJob.pause()` and `UploadJob.cancel()` must work both:
    - while waiting for a slot
    - while uploading
  - On pause/cancel/failure:
    - call `/api/upload/release` as best-effort cleanup
    - if the release request fails, rely on the TTL fallback
  - `UploadManager` must be updated so that:
    - jobs in `waiting_for_slot` are not removable
    - queue scheduling does not spin endlessly
    - local scheduling still stays capped
    - the UI remains deterministic when some jobs are waiting on Redis and others are actively uploading
  - Update UI copy so a user sees a clear state such as:
    - `"Waiting for an upload slot"`
    - not a generic failure

- [ ] **12.7 - Harden timing-sensitive comparisons**
  - Files:
    - `secure-vault/src/lib/sharing/otp-service.ts`
    - any other secret/hash comparison sites found by audit
  - Replace direct OTP hash comparison:
    - current code uses `otpRow.otp_hash !== hashOtp(input.code)`
  - Use `safeCompare()` for in-memory secret, token, or hash comparisons.
  - Scope for this phase:
    - OTP hash verification
    - any share/auth token comparison that happens in application memory
  - Do not try to replace SQL equality predicates with `safeCompare()`.
    - Database lookup by indexed token column is still correct.
  - Add a short audit note in the phase output:
    - future password-reset and email-verification token flows must also use the same helper

- [ ] **12.8 - Lock down security header regressions**
  - Files:
    - `secure-vault/next.config.ts`
    - `secure-vault/tests/download/headers-config.test.ts`
  - The headers are already mostly present today.
  - This task is to confirm they remain correct and add stronger automated assertions.
  - Explicitly verify:
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: DENY` for the main app
    - preview exceptions remain `SAMEORIGIN`
    - CSP `frame-ancestors 'none'` for non-preview routes
    - CSP `frame-ancestors 'self'` for preview routes
    - `Referrer-Policy: strict-origin-when-cross-origin`
  - Keep the existing preview behavior intact.
    - Do not accidentally break embedded previews while hardening the rest of the app.

---

## Detailed Implementation Notes

### Redis module shape

Keep the Redis wiring behind small repo-owned helpers so tests can mock the repo code instead of mocking Redis client internals everywhere.

Recommended exports:

- `getRedisAdapter()`
- `enforceRateLimit(...)`
- `claimUploadSlot(...)`
- `refreshUploadSlot(...)`
- `releaseUploadSlot(...)`

Recommended adapter capabilities:

- `get(key)`
- `set(key, value, options)`
- `del(key)`
- `expire(key, seconds)`
- `incr(key)`
- `ttl(key)`
- `eval(...)` or equivalent atomic-script execution support

If the adapter abstraction ends up too narrow for scripts, expose a dedicated higher-level repository instead, but keep the rest of the app insulated from provider-specific clients.

### Response contracts

Use stable error contracts so the client can behave predictably.

Recommended JSON bodies:

- Rate limit:
  - `{ "message": "Too many requests. Please try again later." }`
- Upload slot unavailable:
  - `{ "message": "Maximum active uploads reached. Waiting for a slot." }`

For upload slot rejections, always include:

- `Retry-After`

### Logging

Add minimal server logs for:

- repeated rate-limit rejections
- upload slot claim failures
- stale lease/counter repair

Do **not** log:

- raw OTP codes
- raw tokens
- password hashes
- share tokens

### Backward compatibility

This phase should not require a rewrite of:

- `upload_sessions`
- upload resume logic
- the existing queue provider/hook architecture

The Redis lease layer should sit on top of the current flow, not replace it.

### Local environment contract

The final implementation must support these environment options:

- Local/self-hosted Redis:
  - `REDIS_URL=redis://127.0.0.1:6379`

Resolution rules:

- use `REDIS_URL`
- if neither configuration is present, fail fast with a clear startup error when Redis-backed functionality is first used

---

## Test Plan

This phase must ship with both unit/integration coverage and end-to-end coverage.

### Unit and Integration Tests

- [ ] `secure-vault/tests/auth/login-action.test.ts`
  - 6th attempt for the same `ip + email` returns the rate-limit error
  - limited requests do not call `getUserByEmail`
  - a different email gets a different bucket
  - window expiry allows login again

- [ ] `secure-vault/tests/auth/signup-action.test.ts`
  - repeated signups from the same IP are blocked on the configured threshold
  - limited requests do not hash the password or create the user

- [ ] New tests for the rate-limit helper, for example:
  - `secure-vault/tests/security/rate-limit.test.ts`
  - verifies helper output, headers, key construction, and both adapter paths in tests

- [ ] New Redis adapter tests, for example:
  - `secure-vault/tests/security/redis-adapter.test.ts`
  - `REDIS_URL` selects the node Redis adapter
  - missing config fails with a clear error

- [ ] `secure-vault/tests/sharing/request-otp-route.test.ts`
  - request limiter returns `429`
  - existing generic success behavior for disallowed email still remains
  - limited requests do not call `createAndSendOtp`

- [ ] `secure-vault/tests/sharing/verify-otp-route.test.ts`
  - verify limiter returns `429`
  - limited requests do not create share access sessions

- [ ] `secure-vault/tests/sharing/otp-service.test.ts`
  - OTP verification uses `safeCompare`
  - wrong code increments attempt count
  - correct code succeeds
  - equal hash length but different value still fails

- [ ] `secure-vault/tests/download/download-route.test.ts`
  - owned download route returns `429` before `streamOwnedFile()` is called

- [ ] `secure-vault/tests/sharing/share-routes.test.ts`
  - public share download returns `429` before `streamSharedFile()` is called
  - public share preview returns `429` before `streamSharedFile()` is called

- [ ] New upload slot service tests, for example:
  - `secure-vault/tests/upload/upload-concurrency.test.ts`
  - claim succeeds when below limit
  - repeat claim for the same `uploadId` is idempotent
  - 4th concurrent upload is rejected when max is 3
  - release removes the lease and decrements once
  - double release is a no-op
  - stale counter repair prevents permanent lockout

- [ ] New upload start/release route tests, for example:
  - `secure-vault/tests/upload/start-route.test.ts`
  - `secure-vault/tests/upload/release-route.test.ts`
  - wrong user cannot claim another user's upload
  - expired upload cannot claim a slot
  - missing/invalid `uploadId` returns `400`
  - `Retry-After` is present on `429`

- [ ] `secure-vault/tests/upload/upload-job.test.ts`
  - transitions to `waiting_for_slot` on `/api/upload/start` `429`
  - retries after `Retry-After`
  - pause while waiting releases local control cleanly
  - cancel while waiting stops retries
  - success path claims and later releases the slot
  - chunk upload with expired/missing lease follows the chosen recovery behavior
  - completion failure still attempts release

- [ ] `secure-vault/tests/upload/upload-manager.test.ts`
  - waiting jobs are scheduled correctly
  - the manager does not exceed the shared max concurrency
  - a job that leaves `waiting_for_slot` allows the next queued item to progress

- [ ] `secure-vault/tests/upload/init-route.test.ts`
  - upload init rate limiting returns `429`
  - limited init does not call `initializeUpload`

- [ ] `secure-vault/tests/upload/chunk-route.test.ts`
  - chunk route rejects when user is rate limited
  - chunk route rejects when the upload slot lease is invalid

- [ ] `secure-vault/tests/upload/complete-route.test.ts`
  - release logic runs on success
  - release logic is still attempted on failure

- [ ] `secure-vault/tests/download/headers-config.test.ts`
  - assert `nosniff`, `X-Frame-Options`, `Referrer-Policy`, and the CSP preview exceptions explicitly

### End-to-End Tests

- [ ] New auth brute-force spec, for example:
  - `secure-vault/tests/e2e/auth-rate-limit.spec.ts`
  - 6 bad login attempts from one browser are blocked
  - the UI shows the rate-limit message
  - after a short test window or mocked reset, login works again

- [ ] New upload global queue spec, for example:
  - `secure-vault/tests/e2e/upload-global-queue.spec.ts`
  - sign in as the same user in two browser contexts
  - start 3 uploads in context A so all global slots are occupied
  - start another upload in context B
  - verify the extra upload shows `Waiting for an upload slot`
  - complete or cancel one upload in context A
  - verify the waiting upload in context B starts without a page reload

- [ ] Extend `secure-vault/tests/e2e/upload-queue-controls.spec.ts`
  - cover pause/cancel while the job is waiting on a global slot
  - verify no duplicate chunk uploads start while waiting

- [ ] New share abuse-protection spec, for example:
  - `secure-vault/tests/e2e/share-rate-limit.spec.ts`
  - repeated OTP verification attempts hit `429`
  - repeated share downloads or previews hit `429`

- [ ] Local Docker Redis smoke validation
  - start Redis via Docker Compose
  - run the app with `REDIS_URL`
  - confirm global upload slot enforcement works against the Docker Redis instance

### Edge Cases That Must Be Covered

- [ ] Same `uploadId` claimed twice does not increment the Redis counter twice
- [ ] Releasing a missing lease does not decrement below zero
- [ ] Browser crash or abandoned upload eventually frees the slot by TTL expiry
- [ ] Rate-limited upload init does not create extra DB records
- [ ] Waiting upload does not show as failed in the UI
- [ ] A limited download route does not begin R2 streaming
- [ ] OTP hash comparison stays timing-safe
- [ ] Preview routes stay embeddable while the rest of the app stays frame-denied
- [ ] Local Docker Redis satisfies the app-level contract

---

## Production Readiness Checklist

- [ ] Local Docker Redis path documented and working with `REDIS_URL`
- [ ] `Retry-After` headers present on all `429` responses
- [ ] No raw secrets or tokens logged
- [ ] Shared upload concurrency constant is defined in one place
- [ ] Global upload limit is enforced across at least two browser contexts in E2E
- [ ] Local queue UX still works for pause, resume, cancel, and remove
- [ ] Headers regression test passes
- [ ] All new rate-limit and upload-slot tests pass
- [ ] Manual production smoke check confirms rate limiting works on the deployed environment, not just locally

---

## Suggested File Inventory

### New Files

- `secure-vault/src/lib/redis.ts`
- `secure-vault/src/lib/rate-limit.ts`
- `secure-vault/src/lib/upload/upload-concurrency.ts`
- `secure-vault/src/app/api/upload/start/route.ts`
- `secure-vault/src/app/api/upload/release/route.ts`
- `compose.yaml`
- tests for rate limiting and upload slot management

### Existing Files Likely To Change

- `secure-vault/package.json`
- `secure-vault/.env.example`
- `secure-vault/README.md`
- `secure-vault/src/app/(auth)/login/actions.ts`
- `secure-vault/src/app/(auth)/signup/actions.ts`
- `secure-vault/src/app/api/share/[token]/request-otp/route.ts`
- `secure-vault/src/app/api/share/[token]/verify-otp/route.ts`
- `secure-vault/src/app/api/share/[token]/download/route.ts`
- `secure-vault/src/app/api/share/[token]/preview/route.ts`
- `secure-vault/src/app/api/files/[id]/download/route.ts`
- `secure-vault/src/app/api/files/[id]/preview/route.ts`
- `secure-vault/src/app/api/upload/init/route.ts`
- `secure-vault/src/app/api/upload/status/route.ts`
- `secure-vault/src/app/api/upload/chunk/route.ts`
- `secure-vault/src/app/api/upload/chunk/service.ts`
- `secure-vault/src/app/api/upload/complete/route.ts`
- `secure-vault/src/app/api/upload/complete/service.ts`
- `secure-vault/src/lib/auth/request-metadata.ts`
- `secure-vault/src/lib/constants/upload.ts`
- `secure-vault/src/lib/upload/upload-job.ts`
- `secure-vault/src/lib/upload/upload-manager.ts`
- `secure-vault/src/lib/upload/upload-manager.constants.ts`
- `secure-vault/src/lib/sharing/otp-service.ts`
- `secure-vault/next.config.ts`
