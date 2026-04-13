# Phase 20 - SeaweedFS Migration & Object Storage Abstraction

> **Objective:** Migrate SecureVault from a Cloudflare R2-branded storage integration to a provider-agnostic object storage layer backed by SeaweedFS, without regressing encrypted uploads, streamed downloads, trash cleanup, or operational safety.

**Depends on:** Phase 4 (Upload), Phase 5 (Download), Phase 9 (Thumbnails), Phase 10 (Trash & Soft Delete), Phase 18 (Deployment & QA)  
**Related to:** Phase 12 (rate limits / upload concurrency), Phase 14 (storage dashboard), Phase 19 (post-upload indexing)  
**Audited on:** 2026-04-11 against `secure-vault/`

---

## Why This Phase Exists

The current codebase already uses an S3-compatible API surface, but the implementation is tightly branded around R2 in naming, configuration, and storage metadata.

That is good news for migration feasibility:

- the app is **not** using Cloudflare-only APIs such as presigned browser uploads, R2 event hooks, or R2-only lifecycle features
- the object-store calls are concentrated behind one module
- upload/download semantics are owned by the application, not delegated to the provider

The migration is therefore primarily:

1. an **abstraction and configuration cleanup**
2. a **SeaweedFS compatibility verification effort**
3. an **infrastructure rollout project**

It is **not** just an environment variable swap, and it should not be executed as a big-bang production cutover without staged verification.

---

## Implementation Status vs Codebase Reality

### Current Storage Integration

| Area | Current location | Current behavior |
| --- | --- | --- |
| Object storage adapter | `secure-vault/src/lib/storage/r2.ts` | AWS SDK S3 client configured specifically for Cloudflare R2 |
| Upload chunk write path | `secure-vault/src/app/api/upload/chunk/service.ts` | Encrypts stream server-side, uploads one encrypted chunk object at a time |
| Download read path | `secure-vault/src/app/api/files/[id]/service.ts` | Streams chunk objects sequentially, decrypts them, returns one file stream |
| Trash cleanup object deletes | `secure-vault/src/app/api/files/trash-service.ts` | Uses delete-by-key and list-by-prefix helpers |
| Storage metadata | `secure-vault/src/lib/db/schema/file-chunks.ts`, `secure-vault/src/lib/db/schema/files.ts` | Stores `r2_key` and `thumbnail_r2_key` |
| Configuration and docs | `secure-vault/.env.example`, `secure-vault/README.md` | R2-specific env names and setup language |
| Dev infrastructure | `compose.yaml` | MariaDB and Redis only; no object storage service is defined locally |

### Important Reality Checks

- Uploads are **application-managed chunk uploads**, not provider-managed multipart uploads.
- Downloads are **application-managed file reconstruction** from chunk metadata in MariaDB.
- The app depends on only a narrow S3 surface:
  - `PutObject`
  - streamed upload via `@aws-sdk/lib-storage`
  - `GetObject`
  - `DeleteObject`
  - `ListObjectsV2`
- The migration risk is therefore concentrated in:
  - streamed body compatibility
  - list/delete-by-prefix behavior
  - deployment and durability of SeaweedFS itself

### Corrections to Simplistic Migration Assumptions

- This should **not** be treated as "replace endpoint and ship".
- This should **not** rename database columns in the same rollout as the storage-provider swap unless there is a hard requirement.
- This should **not** switch the application to SeaweedFS-native APIs. Keep the app on the S3-compatible API layer unless proven necessary.
- This should **not** cut over production before local and staging prove:
  - encrypted chunk upload works under retry and concurrency
  - streamed download works under cancellation and sequential chunk reads
  - trash purge and stale upload cleanup still remove objects correctly

---

## Architecture Chosen

### A. Introduce a provider-agnostic object storage boundary

The existing `r2.ts` module is the correct seam, but it is too provider-specific in naming and configuration.

This phase should introduce a generic object-storage boundary such as:

- `src/lib/storage/object-store.ts`
- `src/lib/storage/providers/s3-compatible.ts`
- `src/lib/storage/index.ts`

The rest of the app should depend on object-storage behavior, not on R2 branding.

### B. Keep the application on S3-compatible semantics

Do not rewrite upload or download flows around SeaweedFS filer APIs or direct HTTP volume APIs.

The app should continue to rely on the AWS SDK S3 client so the storage surface remains:

- portable
- testable
- replaceable later if SeaweedFS is swapped again

This keeps the storage provider as infrastructure, not application architecture.

### C. Keep database storage-key columns stable in the first migration

The current schema stores:

- `file_chunks.r2_key`
- `files.thumbnail_r2_key`

For the initial migration, keep these columns intact and treat them as historical names for "object key".

Reasoning:

- they do not block SeaweedFS usage
- they are internal metadata, not user-facing API fields
- renaming them requires schema migration, data migration, test churn, and review risk unrelated to the provider cutover

If naming cleanup is desired, do it in a separate follow-up after SeaweedFS is stable.

### D. Add local SeaweedFS infrastructure explicitly

The current `compose.yaml` has no object-storage service. That is a gap.

This phase should add a local SeaweedFS topology for development and automated validation. Minimum viable topology:

- SeaweedFS master
- SeaweedFS volume server
- SeaweedFS filer
- SeaweedFS S3 gateway

The application should point only at the S3 gateway endpoint.

### E. Preserve rollback simplicity

Rollback must be infrastructure-driven:

- application code should support generic S3-compatible configuration
- switching from SeaweedFS back to R2 should be achievable by environment/config change
- no business logic should become SeaweedFS-only during the initial migration

### F. Validate compatibility before optimization

Do not optimize for SeaweedFS-specific features in this phase.

This phase is complete when:

- SecureVault works unchanged from a user perspective
- SeaweedFS is proven compatible with the existing encrypted chunk model
- operational runbooks and rollback steps exist

This phase is **not** complete merely because uploads work on one happy path.

---

## Affected Areas

### Application Files

| Area | Expected impact |
| --- | --- |
| `secure-vault/src/lib/storage/r2.ts` | Replace or split into provider-agnostic object store modules |
| `secure-vault/src/app/api/upload/chunk/service.ts` | Import path changes; object-key naming cleanup only |
| `secure-vault/src/app/api/files/[id]/service.ts` | Import path changes; object-key naming cleanup only |
| `secure-vault/src/app/api/files/trash-service.ts` | Import path changes; prefix delete/list behavior must be revalidated |
| `secure-vault/.env.example` | Replace R2-specific config with generic object store config |
| `secure-vault/README.md` | Update local setup and deployment docs |
| `secure-vault/package.json` | Add local SeaweedFS dev scripts if needed |
| `compose.yaml` | Add SeaweedFS services and persistence volumes |

### Database and Schema

| Area | Expected impact |
| --- | --- |
| `secure-vault/src/lib/db/schema/file-chunks.ts` | No schema change required for first migration |
| `secure-vault/src/lib/db/schema/files.ts` | No schema change required for first migration |
| Existing rows in MariaDB | Existing object keys remain valid if the destination bucket contains migrated objects |

### Tests

| Test layer | Expected impact |
| --- | --- |
| Unit tests around storage adapter | New abstraction, config validation, SDK options |
| Upload service tests | Storage adapter mocking changes, compatibility assertions |
| Download service tests | Storage adapter mocking changes, sequential chunk stream assertions |
| Trash/cleanup tests | Object deletion and prefix listing behavior validation |
| E2E/manual validation | New local/staging infrastructure and migration smoke tests |

### Operations

| Area | Expected impact |
| --- | --- |
| Local dev | Must be able to boot SeaweedFS locally |
| Staging | Requires SeaweedFS deployment and bucket/user provisioning |
| Production | Requires data migration, cutover plan, rollback plan, and monitoring |

---

## Detailed Tasks

### 20.1 - Introduce a provider-agnostic object storage contract

- [ ] Create a generic storage contract in `secure-vault/src/lib/storage/`
- [ ] Replace `r2.ts` as the public dependency surface with a provider-neutral module
- [ ] Keep the public API minimal and stable

Recommended interface:

```ts
export type ObjectStore = {
  putObject(key: string, body: Body, contentType?: string): Promise<void>;
  putObjectStream(key: string, body: Readable | ReadableStream<unknown>, contentType?: string): Promise<void>;
  getObjectStream(key: string, abortSignal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  deleteObject(key: string): Promise<void>;
  listObjects(prefix: string): Promise<{ keys: string[] }>;
  buildObjectKey(userId: string, fileId: string, chunkIndex?: number): string;
};
```

- [ ] Implement a concrete S3-compatible provider module using `@aws-sdk/client-s3`
- [ ] Keep AWS SDK usage centralized in the provider module
- [ ] Do **not** let route handlers or services instantiate their own S3 clients
- [ ] Update all imports that currently reference `@/lib/storage/r2`

Affected code paths:

- `secure-vault/src/app/api/upload/chunk/service.ts`
- `secure-vault/src/app/api/files/[id]/service.ts`
- `secure-vault/src/app/api/files/trash-service.ts`

Engineering standard:

- configuration errors must fail fast at boot with explicit messages
- provider construction must be deterministic and testable
- naming inside consuming services should move from `r2Key` toward `objectKey` where practical without forcing schema changes

---

### 20.2 - Replace R2-specific configuration with generic object-storage config

- [ ] Replace R2-branded env names in app configuration and docs
- [ ] Introduce generic environment variables such as:
  - `OBJECT_STORAGE_DRIVER=s3-compatible`
  - `OBJECT_STORAGE_ENDPOINT=...`
  - `OBJECT_STORAGE_REGION=us-east-1`
  - `OBJECT_STORAGE_BUCKET=...`
  - `OBJECT_STORAGE_ACCESS_KEY_ID=...`
  - `OBJECT_STORAGE_SECRET_ACCESS_KEY=...`
  - `OBJECT_STORAGE_FORCE_PATH_STYLE=true|false`
- [ ] Keep backward compatibility with existing R2 env vars for one transition window if production already depends on them
- [ ] Prefer an explicit config resolver that maps legacy R2 config into the new generic config model

Files to update:

- `secure-vault/.env.example`
- `secure-vault/README.md`
- storage provider bootstrap files in `secure-vault/src/lib/storage/`

Important behavior:

- R2 and SeaweedFS may require different endpoint and path-style settings
- the application should not infer provider type from string matching on hostnames
- configuration should be explicit

Definition of done:

- the app can boot against R2 through generic config
- the same app can boot against SeaweedFS through generic config
- docs reflect the new config model

---

### 20.3 - Add local SeaweedFS infrastructure to `compose.yaml`

- [ ] Extend `compose.yaml` with SeaweedFS services
- [ ] Persist data with named Docker volumes
- [ ] Expose the S3 gateway on a predictable local port
- [ ] Add package scripts for local object-storage lifecycle

Recommended local services:

- `seaweed-master`
- `seaweed-volume`
- `seaweed-filer`
- `seaweed-s3`

Recommended script additions in `secure-vault/package.json`:

- `dev:objectstore`
- `dev:objectstore:stop`
- optionally fold object storage into `dev:services`

Required documentation updates:

- how to start SeaweedFS locally
- which bucket to create or seed
- which endpoint the app should use
- expected credentials for local dev

This must be production-minded even in local dev:

- use explicit ports
- use persistent volumes
- keep service names stable
- avoid one-off manual shell steps that are easy to forget

---

### 20.4 - Validate SeaweedFS compatibility against SecureVault’s actual access pattern

This is the highest-risk implementation task in the phase.

- [ ] Validate `putObjectStream()` against SeaweedFS using encrypted chunk streams
- [ ] Validate `getObjectStream()` against SeaweedFS with:
  - sequential chunk reads
  - request cancellation
  - small and multi-chunk files
- [ ] Validate delete-by-key for:
  - uploaded chunks
  - thumbnails
  - partial uploads during cleanup
- [ ] Validate list-by-prefix for:
  - trash purge fallback cleanup
  - expired upload cleanup

Explicit compatibility scenarios to test:

1. single-chunk upload
2. multi-chunk upload
3. resumed upload where one chunk already exists
4. duplicate chunk upload returning conflict semantics at the application layer
5. completed download of a multi-chunk encrypted file
6. aborted download mid-stream
7. purge of exact object keys
8. purge using prefix fallback

If SeaweedFS behavior differs, fix it in the provider adapter first, not in business logic.

Do not spread provider-specific conditionals into:

- upload service
- download service
- trash service
- UI code

---

### 20.5 - Keep schema stable in cutover 1, add code-level naming cleanup only

- [ ] Do not rename `r2_key` or `thumbnail_r2_key` in the first provider migration
- [ ] Add code-level aliases in service/select layers where helpful:
  - DB `r2_key` -> runtime `objectKey`
  - DB `thumbnail_r2_key` -> runtime `thumbnailObjectKey`
- [ ] Update new code and tests to use provider-neutral runtime naming

Reasoning:

- this reduces migration blast radius
- this avoids mixing storage-provider cutover with database churn
- it keeps rollback simpler

Follow-up work can later introduce:

- schema rename migration
- repository-layer field remapping cleanup
- historical terminology cleanup in docs/tests

That follow-up should be separate from the actual SeaweedFS adoption.

---

### 20.6 - Add migration-safe data movement strategy

Production migration requires object data movement, not only code deployment.

- [ ] Define how existing R2 objects move into SeaweedFS
- [ ] Preserve object keys exactly during migration
- [ ] Validate chunk counts and object presence before cutover
- [ ] Keep the MariaDB metadata unchanged if object keys are preserved

Recommended strategy:

1. freeze the target environment definition
2. provision SeaweedFS bucket and credentials
3. bulk-copy existing objects from R2 to SeaweedFS while preserving keys
4. run validation:
   - object counts
   - spot-check chunk keys
   - sample download verification using SecureVault
5. cut application config to SeaweedFS
6. monitor
7. keep rollback path to R2 until confidence window closes

Non-negotiable rule:

- object keys in SeaweedFS must match existing MariaDB metadata exactly unless a full metadata rewrite is part of the plan

---

### 20.7 - Add production rollout, rollback, and observability requirements

- [ ] Create a cutover checklist for staging and production
- [ ] Add explicit smoke tests after deploy
- [ ] Define rollback triggers
- [ ] Ensure logs and metrics can isolate storage-provider failures quickly

Minimum production smoke tests:

1. upload a PNG
2. upload a PDF
3. download both files
4. preview supported file types
5. soft-delete and permanently delete a file
6. run expired-upload cleanup

Rollback triggers:

- upload failure rate materially increases after cutover
- download or preview failure rate increases
- object delete/list behavior is inconsistent
- storage latency causes user-visible timeouts

Rollback mechanism:

- revert application object-storage configuration to R2
- do not require immediate database rollback
- keep SeaweedFS object copy available for investigation, but stop user traffic to it

Observability expectations:

- storage adapter logs should include operation type and object key context where safe
- errors should identify whether failure happened in:
  - object-store write
  - object-store read
  - object-store delete
  - object-store list
- do not log credentials, raw secrets, or decrypted payloads

---

## Recommended Implementation Order

1. Build the generic object storage abstraction.
2. Keep R2 working through the new abstraction first.
3. Add SeaweedFS local Docker topology and docs.
4. Point local dev at SeaweedFS and fix adapter compatibility issues.
5. Add targeted automated tests for the new abstraction and affected flows.
6. Stand up staging SeaweedFS and execute migration smoke tests.
7. Perform object data migration rehearsal preserving keys.
8. Execute production cutover with rollback guardrails.
9. Only after stabilization, consider schema terminology cleanup.

---

## Testing Strategy

This phase needs four layers of verification:

- unit tests for storage config and adapter behavior
- service tests for upload/download/trash flows using the abstraction
- local integration validation against a real SeaweedFS stack
- staging/production smoke tests for operational readiness

### Run Commands

```bash
npx vitest run tests/storage
npx vitest run tests/upload tests/files tests/trash tests/cron
npx playwright test tests/e2e/storage-provider-cutover.spec.ts
```

---

## Unit Tests Needed

### `tests/storage/object-store-config.test.ts` *(new file)*

| # | Test | Expected |
| --- | --- | --- |
| U-1 | Generic config resolves from generic env vars | Provider bootstraps without legacy R2 vars |
| U-2 | Legacy R2 vars map into generic config during transition | Existing deployments keep working |
| U-3 | Missing endpoint/bucket/credentials fail fast | Explicit startup error |
| U-4 | Path-style config is propagated correctly | Provider options match SeaweedFS requirements |

### `tests/storage/s3-compatible-provider.test.ts` *(new file)*

| # | Test | Expected |
| --- | --- | --- |
| P-1 | `putObjectStream()` accepts Web streams | Body is normalized correctly |
| P-2 | `getObjectStream()` supports SDK response body variants | Returns a Web stream in all supported cases |
| P-3 | `listObjects()` normalizes SDK output to plain keys | Callers do not depend on raw SDK response shape |
| P-4 | `buildObjectKey()` preserves current key format | Existing DB metadata remains valid |

### `tests/upload/upload-chunk-service.test.ts`

| # | Test | Expected |
| --- | --- | --- |
| UC-1 | Upload chunk uses provider abstraction, not direct R2 module | Storage dependency is isolated |
| UC-2 | Failed metadata persistence triggers object cleanup | Uploaded object is deleted on DB failure |
| UC-3 | SeaweedFS-compatible streaming path does not require full buffering | Provider receives stream body |
| UC-4 | Duplicate chunk still resolves via DB conflict handling | No provider-specific branching leaks in |

### `tests/files/file-download-service.test.ts` *(new file if missing)*

| # | Test | Expected |
| --- | --- | --- |
| FD-1 | Download reads all chunk object keys in order | Multi-chunk reassembly remains correct |
| FD-2 | Abort signal propagates to object-store reads | Cancelled downloads stop cleanly |
| FD-3 | Provider stream shape differences do not change response behavior | Response remains a valid stream |

### `tests/trash/trash-storage-cleanup.test.ts` *(new file)*

| # | Test | Expected |
| --- | --- | --- |
| TS-1 | Exact-key deletion calls provider once per object | Purge manifest is honored |
| TS-2 | Prefix cleanup uses generic list/delete helpers | No R2-specific import remains |
| TS-3 | Missing object errors are treated as idempotent success | Cleanup remains safe to retry |

---

## Integration and Local Validation

### Real SeaweedFS Local Validation

The following scenarios must run against a real local SeaweedFS stack, not only mocks:

| # | Scenario | Expected |
| --- | --- | --- |
| I-1 | Upload 1 PNG under 5 MB | Upload completes and object exists in SeaweedFS |
| I-2 | Upload 1 PDF around 15 MB | Multi-chunk upload completes |
| I-3 | Resume partially uploaded file | Existing chunks are skipped correctly |
| I-4 | Download completed multi-chunk file | File bytes match original |
| I-5 | Permanently delete a file | Objects are removed from SeaweedFS |
| I-6 | Expired-upload cleanup | Partial objects are removed without quota decrement |

---

## E2E / Smoke Tests

### `tests/e2e/storage-provider-cutover.spec.ts` *(new file)*

| # | Scenario | Expected |
| --- | --- | --- |
| E-1 | Upload then immediate download | User-visible behavior matches pre-migration flow |
| E-2 | Upload PDF then preview | Preview remains functional |
| E-3 | Delete from files then purge from trash | Cleanup path works end-to-end |
| E-4 | Restart app against same SeaweedFS data | Previously uploaded files remain accessible |

### Staging Smoke Checklist

- [ ] App boots with SeaweedFS config only
- [ ] New uploads succeed
- [ ] Existing migrated files download successfully
- [ ] Trash purge deletes objects correctly
- [ ] No provider-specific runtime errors appear in logs

### Production Smoke Checklist

- [ ] Upload image
- [ ] Upload PDF
- [ ] Download both
- [ ] Preview supported content
- [ ] Soft delete then permanently delete one file
- [ ] Verify no sustained increase in 4xx/5xx storage-related failures

---

## Manual Verification Checklist

- [ ] Start local SeaweedFS from `compose.yaml`
- [ ] Point SecureVault to the SeaweedFS S3 endpoint with generic object-store env vars
- [ ] Upload a file smaller than one chunk and verify it is downloadable
- [ ] Upload a file larger than one chunk and verify all chunks stream successfully
- [ ] Pause/resume a multi-chunk upload and verify no corrupted state
- [ ] Permanently delete a file and verify object removal in SeaweedFS
- [ ] Trigger trash cleanup and stale upload cleanup and verify no orphaned metadata remains
- [ ] Restart the app and verify prior SeaweedFS-backed files are still accessible
- [ ] Switch config back to R2 and verify rollback path remains valid

---

## Deliverables

| Output | Location |
| --- | --- |
| Provider-agnostic storage boundary | `secure-vault/src/lib/storage/` |
| SeaweedFS-compatible S3 provider | `secure-vault/src/lib/storage/providers/` |
| Updated upload/download/trash integrations | `secure-vault/src/app/api/upload/`, `secure-vault/src/app/api/files/` |
| Generic object-store env and docs | `secure-vault/.env.example`, `secure-vault/README.md` |
| Local SeaweedFS compose services | `compose.yaml` |
| Storage migration tests | `tests/storage/`, `tests/upload/`, `tests/files/`, `tests/trash/`, `tests/e2e/` |
| Cutover and rollback checklist | This phase document plus deployment notes in `docs/` if needed |

---

## Definition of Done

This phase is done only when all of the following are true:

- SecureVault no longer depends on an R2-branded storage module as its public storage boundary
- The app runs against SeaweedFS through generic S3-compatible configuration
- Upload, download, preview, and cleanup flows pass automated and manual validation
- Local dev can boot SeaweedFS from repo-managed infrastructure
- Production rollout and rollback procedures are documented
- Existing object-key metadata remains valid without a forced schema rename

This phase is **not** done if SeaweedFS only works for happy-path uploads but cleanup, resume, download, or rollback remain unverified.
