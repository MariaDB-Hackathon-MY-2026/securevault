# Phase 19 - Semantic Search for Images and PDFs

> **Objective:** Add a semantic search system for the existing encrypted file vault that stores only images and PDFs, using direct multimodal embeddings with the latest Gemini SDK and model contracts, integrating cleanly with the current upload, search, and files-page UX.

**Depends on:** Phase 1 (DB), Phase 4 (Upload), Phase 5 (Download/Preview), Phase 14 (Storage & Search)  
**Related phase:** Phase 16 (AI Agent)  
**Blueprint ref:** Sections 3 (Upload Flow), 7 (AI Agent), 8 (Schema), 19 (Search & Filter)

> [!IMPORTANT]
> This phase is additive. Upload, download, preview, share links, trash behavior, storage accounting, and filename search must continue to work exactly as they do now even when semantic indexing is disabled, skipped, delayed, or failed.

---

## Current Implementation Snapshot

- [x] `secure-vault/src/lib/upload/upload-job.ts` already triggers `POST /api/embeddings` after `/api/upload/complete` succeeds for eligible PDFs and images.
- [x] `secure-vault/src/components/upload/upload-dialog.tsx` already exposes additive indexing status copy in the upload UI.
- [x] `secure-vault/src/lib/db/schema/embedding-jobs.ts` and `secure-vault/src/lib/db/schema/embedding-chunks.ts` already exist and are exported from `secure-vault/src/lib/db/schema/index.ts`.
- [x] `secure-vault/src/lib/db/schema/_custom-types.ts` already fixes the vector column at `vector(1536)`.
- [x] Filename search already exists end-to-end through `secure-vault/src/lib/search/*`, `secure-vault/src/hooks/use-filename-search-query.ts`, and `secure-vault/src/app/api/search/files/route.ts`.
- [x] File download and preview already reconstruct decrypted file bytes from encrypted chunk storage in `secure-vault/src/app/api/files/[id]/service.ts`.
- [x] File data already lives in R2 object storage and is referenced through the existing chunk + FEK/UEK encryption model.
- [ ] `secure-vault/src/app/api/embeddings/*` is still a placeholder.
- [ ] `secure-vault/src/lib/ai/*` and `secure-vault/src/lib/search/semantic/*` are still placeholders.
- [ ] There is no real multimodal embedding processor, PDF splitter, semantic retrieval service, or vector-search API yet.
- [ ] The current upload client treats a successful `POST /api/embeddings` response as effectively "done", which is not truthful once a real job lifecycle exists.
- [ ] Semantic indexing eligibility is duplicated and already drifting:
  - `secure-vault/src/lib/constants/upload.ts` allows `image/avif`
  - `secure-vault/src/lib/upload/upload-job.ts` semantic-trigger logic does not include `image/avif`
- [ ] The current schema already has `file_id`, `modality`, `page_from`, `page_to`, `chunk_index`, and `embedding`, but it does not yet distinguish `full` vs `window` vs `page` chunks explicitly.

> [!NOTE]
> Phase 19 should build on these seams rather than introducing a parallel upload stack, a second file-read path, or a brand-new search UI contract.

---

## End Goal

Ship semantic retrieval for the existing file vault with these product behaviors:

- Text query -> matching image results
- Text query -> matching PDF results
- Cross-modal retrieval over images and PDFs
- File-oriented results in the UI, even when retrieval is chunk-based internally
- No OCR dependency in the first shipped path

This phase optimizes for:

- semantic file discovery
- visual + conceptual search
- faster time to first production version

This phase is **not** the first-pass solution for:

- exact phrase lookup
- invoice numbers, IDs, SKUs, and legal clause search
- compliance-grade exact text retrieval

---

## Core Architecture Decision

Use **direct multimodal embeddings** as the main indexing method with Gemini's latest embedding model.

The implementation should treat each stored file, page, or PDF window as a semantic object and embed it directly from the decrypted binary file content already stored in the vault.

For this codebase, that means:

- reconstruct decrypted bytes from the existing encrypted chunk storage
- send image or PDF bytes directly to Gemini `embedContent`
- request `outputDimensionality: 1536` so runtime output matches the schema-fixed `vector(1536)`
- normalize both stored vectors and query vectors before persistence/search because the latest docs note normalization is required when using reduced dimensions such as `1536`
- store vectors in `embedding_chunks`
- keep `embedding_jobs` as the truthful lifecycle record
- expose search through a new semantic route that matches the current files-page search architecture

The first shipped version should **not** depend on a full OCR pipeline.

---

## Implementation Blueprint

This phase should be implemented as five cooperating layers, each with a single responsibility.

### 1. Client trigger and status surfaces

Files:

- `secure-vault/src/lib/upload/upload-job.ts`
- `secure-vault/src/components/upload/upload-dialog.tsx`
- `secure-vault/src/components/upload/upload-provider.tsx`
- `secure-vault/src/components/files/*`
- `secure-vault/src/hooks/use-semantic-search-query.ts`

Responsibilities:

- trigger indexing only after upload completion
- poll truthful job status
- expose semantic search as an explicit files-page mode
- never couple upload success to indexing success

### 2. Route layer

Files:

- `secure-vault/src/app/api/embeddings/route.ts`
- `secure-vault/src/app/api/embeddings/[fileId]/route.ts`
- `secure-vault/src/app/api/search/semantic/route.ts`
- `secure-vault/src/app/api/cron/embeddings/route.ts`

Responsibilities:

- auth
- input validation
- response shaping
- stable error/status mapping
- calling the correct service

### 3. Embedding orchestration layer

Files:

- `secure-vault/src/lib/ai/embeddings/embedding-job-service.ts`
- `secure-vault/src/lib/ai/embeddings/embedding-job-repository.ts`
- `secure-vault/src/lib/ai/embeddings/dispatcher.ts`
- `secure-vault/src/lib/ai/embeddings/inline-dispatcher.ts`
- `secure-vault/src/lib/ai/embeddings/queue-dispatcher.ts`

Responsibilities:

- create or reuse jobs
- claim jobs safely
- dispatch processing
- apply retry policy
- update heartbeats and lease metadata

### 4. File processing and embedding layer

Files:

- `secure-vault/src/lib/files/file-bytes.ts`
- `secure-vault/src/lib/ai/embeddings/pdf-page-plan.ts`
- `secure-vault/src/lib/ai/embeddings/pdf-splitter.ts`
- `secure-vault/src/lib/ai/embeddings/embedder.ts`
- `secure-vault/src/lib/ai/embeddings/embedding-processor.ts`
- `secure-vault/src/lib/ai/embeddings/persist-embeddings.ts`

Responsibilities:

- reconstruct decrypted file bytes
- generate the indexing plan for images and PDFs
- embed image and PDF chunks directly
- persist chunk records safely

### 5. Retrieval layer

Files:

- `secure-vault/src/lib/search/semantic/query-embedder.ts`
- `secure-vault/src/lib/search/semantic/semantic-search.ts`
- `secure-vault/src/lib/search/semantic/semantic-search-query.ts`
- `secure-vault/src/lib/search/semantic/index.ts`

Responsibilities:

- embed queries
- run vector retrieval against auth-scoped file data
- fold chunk hits into file hits
- return DTOs shaped for the current files UI

> [!NOTE]
> An engineer implementing this phase should not move logic between layers casually. Keeping these seams clean is part of what makes the feature production-safe.

---

## Dependencies and Config

### New runtime dependencies

Add:

- `pdf-lib`
- `@google/genai`

Do not add OCR SDKs in the initial implementation path unless the team explicitly decides to ship selective OCR in the same phase.

### Required environment variables

Add and validate centrally in `secure-vault/src/lib/ai/config.ts`:

- `SEMANTIC_INDEXING_ENABLED`
- `SEMANTIC_INDEXING_EXECUTION_MODE`
- `SEMANTIC_INDEXING_PROVIDER`
- `GEMINI_API_KEY`
- `GEMINI_EMBEDDING_MODEL`
- `SEMANTIC_INDEXING_MAX_CONCURRENCY`
- `SEMANTIC_INDEXING_QUERY_TOP_K`
- `SEMANTIC_INDEXING_MAX_RETRY_ATTEMPTS`
- `SEMANTIC_INDEXING_RETRY_BACKOFF_MS`
- `PDF_FULL_EMBED_MAX_PAGES`
- `PDF_WINDOW_SIZE_PAGES`
- `PDF_WINDOW_OVERLAP_PAGES`
- `PDF_INDEXING_MAX_BYTES`
- `EMBEDDING_REQUEST_TIMEOUT_MS`

Required config validation:

- `SEMANTIC_INDEXING_EXECUTION_MODE` must be exactly one of: `inline`, `queued`
- `SEMANTIC_INDEXING_PROVIDER` must be exactly one of: `google`, `fake`
- `GEMINI_API_KEY` is required when `SEMANTIC_INDEXING_PROVIDER=google`
- `GEMINI_EMBEDDING_MODEL` is required when `SEMANTIC_INDEXING_PROVIDER=google`
- the v1 default Gemini embedding model is `gemini-embedding-2-preview`
- `PDF_FULL_EMBED_MAX_PAGES` must be `6` unless intentionally changed across code and tests
- `PDF_WINDOW_SIZE_PAGES` must be `6` for v1
- `PDF_WINDOW_OVERLAP_PAGES` must be `1` for v1
- `SEMANTIC_INDEXING_QUERY_TOP_K` is the internal chunk-candidate count fetched before file-level folding
- `SEMANTIC_INDEXING_QUERY_TOP_K` must be an integer between `25` and `200`
- the v1 default `SEMANTIC_INDEXING_QUERY_TOP_K` is `50`
- configured vector dimensions must match schema-fixed `1536`
- the provider call must set `outputDimensionality: 1536`
- stored document vectors and query vectors must be normalized after embedding generation and before persistence/search
- `SEMANTIC_INDEXING_MAX_CONCURRENCY` must be an integer `>= 1`
- `SEMANTIC_INDEXING_MAX_RETRY_ATTEMPTS` must be an integer `>= 0`
- `SEMANTIC_INDEXING_RETRY_BACKOFF_MS` must be an integer `>= 100`
- `PDF_INDEXING_MAX_BYTES` must be an integer `> 0`
- `EMBEDDING_REQUEST_TIMEOUT_MS` must be an integer `>= 1000`
- `REDIS_URL` is required when `SEMANTIC_INDEXING_EXECUTION_MODE=queued`
- feature-disable mode must short-circuit indexing cleanly without affecting uploads
- `SEMANTIC_INDEXING_EXECUTION_MODE=queued` is invalid unless the worker process is enabled in the deployment topology

Deterministic test-provider rule:

- Phase 19 must include a fake/test embedding provider mode for Vitest and Playwright
- the fake provider must return deterministic vectors for the same input so ranking assertions do not depend on live Gemini behavior
- the fake provider must exercise the same route/job/worker codepaths as the real provider wherever practical
- production config must fail if `SEMANTIC_INDEXING_PROVIDER=fake` is selected outside approved test/dev environments

### Exact provider contract for v1

Use one concrete provider path in this phase:

- provider package: `@google/genai`
- provider id: `google`
- test provider id: `fake`
- provider implementation lives only under `secure-vault/src/lib/ai/providers/*`
- the provider layer is the only place allowed to know SDK request/response syntax

Provider behavior must be fixed for this phase:

- images are sent directly to `embedContent` as multimodal content using the latest `@google/genai` SDK shape
- PDFs are sent directly to `embedContent` as multimodal content using the latest `@google/genai` SDK shape
- `embedContent` uses `GEMINI_EMBEDDING_MODEL`
- `embedContent` must request `outputDimensionality: 1536`
- the embedding provider must return exactly `1536` float dimensions per embedding
- the provider output must be normalized before persistence and before similarity search because reduced-dimension outputs are not treated as implicitly normalized in the docs
- any provider response that does not match `1536` dimensions must fail with `VECTOR_DIMENSION_MISMATCH`
- provider-specific limits, MIME handling, and timeouts must be normalized into the stable error codes documented below rather than leaking raw SDK errors upward

---

## Route Contracts

These contracts should be implemented exactly so frontend, cron, and tests all target the same behavior.

### Stable error codes

Use this exact error-code set across routes, services, cron, logs, and tests:

```ts
type EmbeddingErrorCode =
  | "SEMANTIC_INDEXING_DISABLED"
  | "SEMANTIC_INDEXING_UNAVAILABLE"
  | "UNSUPPORTED_MIME"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_READY"
  | "FILE_DELETED"
  | "DECRYPT_FAILED"
  | "R2_READ_FAILED"
  | "PDF_PARSE_FAILED"
  | "EMBEDDING_PROVIDER_FAILED"
  | "EMBEDDING_PROVIDER_TIMEOUT"
  | "VECTOR_DIMENSION_MISMATCH"
  | "JOB_LEASE_EXPIRED";
```

Usage rule:

- `SEMANTIC_INDEXING_UNAVAILABLE` is route-only in v1 and must not be persisted to `embedding_jobs`
- all other listed codes are the only valid persisted values for `embedding_jobs.error_code`

### Shared route error response

Use this exact error shape for `POST /api/embeddings`, `GET /api/embeddings/{fileId}`, `POST /api/search/semantic`, and `POST /api/cron/embeddings` when they return non-`2xx`:

```ts
type RouteErrorResponse = {
  errorCode:
    | "INVALID_REQUEST"
    | "UNAUTHENTICATED"
    | "NOT_FOUND"
    | "CONFLICT"
    | "FORBIDDEN"
    | EmbeddingErrorCode;
  message: string;
  retryable: boolean;
};
```

Rules:

- `INVALID_REQUEST` is used for validation failures
- `UNAUTHENTICATED` is used for missing auth
- `NOT_FOUND` is used when the file is missing or not owned
- `CONFLICT` is used for invalid retry/reindex state transitions
- `FORBIDDEN` is reserved for cron-secret failures if the cron route uses `403`
- route handlers must not return ad hoc error payloads outside this shape

### `POST /api/embeddings`

Purpose:

- create or reuse a semantic indexing job for a specific file and modality

Request body:

```ts
type StartEmbeddingJobRequest = {
  fileId: string;
  modality: "image" | "pdf";
  action?: "enqueue" | "retry" | "reindex";
};
```

Success response:

```ts
type StartEmbeddingJobResponse = {
  fileId: string;
  jobId: string;
  modality: "image" | "pdf";
  status: "queued" | "processing" | "ready" | "skipped" | "failed";
  accepted: boolean;
  retryable: boolean;
  errorCode: EmbeddingErrorCode | null;
  attemptCount: number;
  updatedAt: string;
};
```

Rules:

- `accepted = true` means the request was accepted or an existing job was reused
- `accepted` does not mean indexing is complete
- default `action` is `"enqueue"`
- all accepted or reused responses must return `202`
- `202` is the only success status for `POST /api/embeddings` in v1
- if semantic indexing is disabled, the service must create or reuse the logical job row in `skipped` state with `errorCode = "SEMANTIC_INDEXING_DISABLED"`
- if the file is ineligible because of MIME or size, the service must create or reuse the logical job row in `skipped` state with `errorCode = "UNSUPPORTED_MIME"` or `errorCode = "FILE_TOO_LARGE"`
- `action="enqueue"`:
  - if a matching job already exists in `queued`, `processing`, or `ready`, return it unchanged
  - if the latest job is `failed`, return it unchanged unless the caller explicitly asks for `retry`
- `action="retry"`:
  - allowed only when the latest job is `failed`
  - allowed only when the latest job is `failed` and `retryable = true`
  - reset the existing logical job safely instead of creating a second job row
  - reuse the same `jobId`
  - reject with `409` when the latest job is not retryable or is not in `failed`
- `action="reindex"`:
  - allowed only for an existing `ready`, `failed`, or `skipped` logical job
  - reuses the same logical job identity and replaces prior chunk rows safely
  - reuses the same `jobId`
  - reject with `409` if a job is already `queued` or `processing`
- `action="reindex"` is the only supported human-triggered path for re-running a non-retryable `failed` job after the underlying cause has been fixed
- routes and tests must not infer retry/reindex intent from timing or duplicate POSTs alone

Status mapping:

- `400` invalid payload
- `401` unauthenticated
- `404` file not found or not owned
- `409` invalid file state or claim conflict
- `202` accepted or reused, including `skipped`

### `GET /api/embeddings/{fileId}`

Purpose:

- return the latest semantic indexing status for all supported modalities on the file

Success response:

```ts
type EmbeddingJobStatusItem = {
  jobId: string;
  modality: "image" | "pdf";
  status: "queued" | "processing" | "ready" | "skipped" | "failed";
  retryable: boolean;
  errorCode: EmbeddingErrorCode | null;
  errorMessage: string | null;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type GetEmbeddingStatusResponse = {
  fileId: string;
  jobs: EmbeddingJobStatusItem[];
};
```

Rules:

- return only jobs for the authenticated owner
- if no embedding job exists yet for the owned file, return `200` with `jobs: []`
- omit plaintext document content
- return machine-readable retryability and error codes

Status mapping:

- `200` success
- `401` unauthenticated
- `404` file not found or not owned

### `POST /api/search/semantic`

Purpose:

- perform semantic retrieval over indexed files

Request body:

```ts
type SemanticSearchRequest = {
  query: string;
  limit?: number;
};
```

Success response:

```ts
type SemanticSearchResult = {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  updatedAt: string;
  score: number;
  folderId: string | null;
  folderPath: Array<{ id: string; name: string }>;
  isInRoot: boolean;
  pageFrom: number | null;
  pageTo: number | null;
  matchType: "image" | "pdf_full" | "pdf_window" | "pdf_page";
  canPreview: boolean;
};

type SemanticSearchResponse = {
  query: string;
  limit: number;
  results: SemanticSearchResult[];
};
```

Rules:

- trim the query before validation
- reject queries shorter than `2` non-whitespace characters
- reject queries longer than `500` characters
- default `limit` to `10`
- clamp `limit` only by rejecting invalid input; do not silently rewrite it
- require `limit` to be an integer between `1` and `25`
- return one result per file after folding
- derive preview/navigation context from existing file routes, not stored URLs
- use a deterministic folding/ranking contract rather than implementation-defined grouping
- return `503` with `errorCode = "SEMANTIC_INDEXING_DISABLED"` when semantic retrieval is disabled
- return `503` with `errorCode = "SEMANTIC_INDEXING_UNAVAILABLE"` when semantic retrieval is enabled but backend provider/config bootstrap is unavailable

Status mapping:

- `200` success
- `400` invalid query or limit
- `401` unauthenticated
- `503` semantic retrieval disabled or unavailable

---

## Job State Machine

Use this state machine literally:

- `queued`
  - initial accepted state
- `processing`
  - claimed by one processor with an active lease
- `ready`
  - all embeddings for that attempt persisted successfully
- `failed`
  - terminal failure for this attempt
- `skipped`
  - terminal non-processing outcome, such as disabled feature or unsupported file

Allowed transitions:

- `queued -> processing`
- `queued -> skipped`
- `processing -> ready`
- `processing -> failed`
- `failed -> queued` on allowed retry
- `failed -> processing` only through a guarded retry claim path

Disallowed transitions:

- `ready -> processing` without explicit reindex
- `ready -> failed`
- `skipped -> processing` unless the underlying eligibility condition changed and the user explicitly retriggered

State ownership rules:

- only the claiming processor may move `processing -> ready` or `processing -> failed`
- only a retry path may move `failed -> queued`
- routes should never set `ready` directly

---

## Primary Retrieval Strategy

### Images

Default strategy:

- one embedding per image file
- no OCR by default

Why this fits the codebase:

- the app already uploads images as first-class files
- the UI already renders file-level cards
- the current schema already supports a single `embedding_chunks` row per file if needed

Optional later upgrade:

- selectively add OCR only for text-heavy images such as screenshots, receipts, and IDs

### PDFs

#### PDFs with 6 pages or fewer

Default strategy:

- embed the entire PDF as one semantic document chunk
- also embed each page as a separate semantic chunk

#### PDFs with more than 6 pages

Default strategy:

- split into overlapping PDF windows
- embed each window
- also embed each page as a separate semantic chunk

Exact v1 windowing:

- window size: 6 pages
- overlap: 1 page

Example for a 20-page PDF:

- pages 1-6
- pages 6-11
- pages 11-16
- pages 16-20

Why this fits the codebase:

- it avoids introducing a text-extraction-first architecture
- it maps naturally onto `embedding_chunks.page_from` / `page_to`
- it supports file-level result folding without flooding the UI with duplicate cards

### Required v1 Precision Rule

Also embed individual PDF pages in addition to full documents or windows.

Why:

- improves precision for diagrams, charts, and single-page sections
- makes preview-page references more useful in the files UI
- gives Phase 16 a better retrieval seam for agent workflows later

This is required for Phase 19 v1 and must not be deferred to a follow-up architecture decision.

---

## Retrieval Prompting Strategy

This system is a **retrieval** use case, not a symmetric semantic-similarity use case.

Use the latest Gemini embedding guidance consistently:

- Query embedding input must be formatted as:
  - `task: search result | query: {trimmed_user_input}`
- Stored document/image/PDF embedding input should include a leading text part formatted as:
  - `title: {file_name_or_page_context} | text: none`
- For multimodal document embeddings, send the leading text part first and the media part second in the `contents` array
- Use the same formatting rules for all stored document chunks and all query embeddings throughout the system
- Query embeddings and document embeddings must both be normalized before similarity comparison

SDK rule:

- use the latest `@google/genai` `models.embedContent` API shape for both query and document embeddings
- do not implement legacy SDK wrappers or deprecated client packages in Phase 19

Why this matters:

- Gemini officially supports direct multimodal embeddings with the current preview model
- it aligns embeddings to query-vs-document retrieval behavior using the latest documented query/document formatting
- it should be implemented once in the provider/embedder layer, not scattered through routes and services

> [!IMPORTANT]
> The codebase should not treat query and document embeddings as interchangeable. Keep the distinction inside `query-embedder.ts` and the document embedding service.

---

## Codebase-Specific Guardrails

- Keep `/api/upload/complete` focused on upload completion only. Do not move embedding generation into the upload-complete route.
- Keep route handlers thin: auth, input validation, response shaping, and error mapping only.
- Put orchestration and processing logic under `secure-vault/src/lib/ai/embeddings/`.
- Put semantic retrieval logic under `secure-vault/src/lib/search/semantic/`.
- Reuse the existing decrypted file-read path from `secure-vault/src/app/api/files/[id]/service.ts` rather than building a second incompatible reader.
- Keep auth scoping consistent with the rest of the app: `user_id`, `files.status = 'ready'`, and `deleted_at IS NULL`.
- Keep semantic search as a **third explicit search mode** beside the existing `filter` and `filename` modes.
- Keep results file-oriented at the API and UI boundary even though retrieval is chunk-oriented under the hood.
- Do not store `preview_url` in the database. This codebase already has preview routes, so preview URLs should be derived at response time.
- Keep vector dimensionality fixed to the schema-supported size for this phase. The current schema supports `vector(1536)`, so runtime config must validate against that instead of pretending dimensions are freely configurable.
- Centralize semantic-indexing eligibility in a shared helper so `upload.ts`, `upload-job.ts`, and the future embeddings route cannot drift.
- Do not make OCR a hard dependency of Phase 19. It is an optional future enhancement for exact-match and text-heavy cases.

---

## Runtime Model

### Required v1 execution model

Use a dispatcher boundary from day one:

- `EmbeddingDispatcher`
- `InlineEmbeddingDispatcher` for local dev and test
- `QueuedEmbeddingDispatcher` backed by Redis for production retry, cron, and backfill flows

`POST /api/embeddings` must:

1. validate auth and ownership
2. create or reuse the job row
3. dispatch work through the configured execution mode
4. return job state, not pretend the file is already indexed

This matches the current repo pattern better than doing all processing inside the route handler while still leaving a production-safe seam for later queueing.

Required v1 queue model:

- `embedding_jobs` in MariaDB remains the source of truth for lifecycle and recovery
- Redis is the hot-path delivery queue and concurrency-coordination layer
- queue messages must contain only lightweight identity fields such as `jobId`, `fileId`, `modality`, and `attemptCount`
- workers must always re-load authoritative job state from MariaDB before processing
- if Redis is unavailable or a queue push fails, the DB row must remain recoverable as `queued` so cron can re-enqueue it later
- do not store decrypted bytes, extracted page payloads, or embedding vectors in Redis

Queueing rule:

- upload-triggered indexing, manual retry, cron retry, and historical backfill must all dispatch through the same `EmbeddingDispatcher` boundary
- cron routes must enqueue retry work; they must not call the embedding processor inline while the HTTP request is open
- when `SEMANTIC_INDEXING_EXECUTION_MODE=queued`, the queue dispatcher is the required execution path for retryable cron work rather than an optional future seam
- the queue dispatcher must push to Redis and return quickly; Next.js route handlers are only coordination points, not workers

### Job lifecycle

Use `embedding_jobs` as the source of truth for status:

- `queued`
- `processing`
- `ready`
- `skipped`
- `failed`

Required metadata additions for production recovery:

- `attempt_count`
- `last_heartbeat_at`
- `lease_expires_at`
- `processor_id`

These fields are mandatory in the Phase 19 migration because the v1 worker, retry, and recovery contracts depend on them.

### Exact v1 job and attempt model

Use one concrete persistence model in this phase:

- there is exactly one logical `embedding_jobs` row per `file_id + modality`
- that row keeps the same `jobId` across enqueue, retry, and reindex
- Phase 19 v1 does not introduce a second attempts table or attempt-scoped chunk-visibility model
- `attempt_count` increments when a processor successfully claims work for a new processing attempt
- all `embedding_chunks` for the current visible index remain attached to the same logical `job_id`
- retry and reindex replace the full chunk set for that `job_id` inside one finalize transaction
- if a future phase needs attempt-scoped shadow writes, that is a separate design change and is out of scope for this document

### Retry model

The upload flow remains non-blocking:

1. upload completes
2. file becomes `ready`
3. semantic indexing is dispatched separately
4. failure updates only the embedding job status, never the file upload outcome

Retry behavior should be explicit and reason-code driven.

#### Manual retry from the UI

UI retry and re-index controls are not required in Phase 19.

If a Phase 19 surface does expose a `Retry indexing` action, it must do so only when:

- the file is still owned by the current user
- the file is still `ready`
- the latest embedding job is `failed`
- the failure code is marked retryable

Manual retry should reuse the same job identity or reset the existing logical job safely, but it must not create duplicate chunk rows.

If a Phase 19 surface does expose a separate `Re-index` action, it must do so only when:

- the file is still owned by the current user
- the file is still `ready`
- the latest embedding job is `ready`, `failed`, or `skipped`
- the current job is not already `queued` or `processing`

`Re-index` is the required human path for non-retryable failures after the underlying cause has been fixed.

#### Automatic retry from cron or a worker

A cron route or worker pickup loop may retry only jobs that meet all of these conditions:

- `status = 'failed'`
- `error_code` is in the retryable set
- `attempt_count < SEMANTIC_INDEXING_MAX_RETRY_ATTEMPTS`
- the file still exists, is owned by the same user, is `ready`, and is not soft-deleted

Required automatic retry targets:

- transient provider failures
- provider timeouts
- temporary R2 read failures
- lease-expired jobs after processor death

Automatic retry must not run for non-retryable business failures such as unsupported file types or permanently bad inputs.

Automatic retry enqueue rule:

- cron must reuse the same dispatcher contract as `POST /api/embeddings`
- retryable jobs should be moved back to `queued` and then dispatched through `QueuedEmbeddingDispatcher` when queue mode is enabled
- the cron route may claim bounded batches and enqueue them, but the expensive PDF parsing, R2 reads, and provider calls must happen in the worker/processor path
- if dispatch/enqueue fails after a retry candidate was reset to `queued`, the implementation must either restore the prior failure state or leave a clearly retryable queued job that a later sweep can pick up safely
- Redis is the preferred retry queue; cron is the reconciliation path when Redis delivery is missed or workers crash

#### Required reason-code policy

Retryable:

- `EMBEDDING_PROVIDER_FAILED`
- `EMBEDDING_PROVIDER_TIMEOUT`
- `R2_READ_FAILED`
- `JOB_LEASE_EXPIRED`

Non-retryable:

- `SEMANTIC_INDEXING_DISABLED`
- `UNSUPPORTED_MIME`
- `FILE_TOO_LARGE`
- `FILE_NOT_READY`
- `FILE_DELETED`
- `PDF_PARSE_FAILED`
- `VECTOR_DIMENSION_MISMATCH`

Conditionally retryable:

- `DECRYPT_FAILED`

`DECRYPT_FAILED` should only be auto-retried if there is strong evidence the failure was transient. Otherwise it should remain manual-only or terminal because repeated retries are unlikely to help.

#### Retry policy table

| Error code | Auto retry | Manual retry | Terminal by default | Notes |
| --- | --- | --- | --- | --- |
| `EMBEDDING_PROVIDER_FAILED` | Yes | Yes | No | Retry with bounded attempts and backoff |
| `EMBEDDING_PROVIDER_TIMEOUT` | Yes | Yes | No | Treat as transient provider failure |
| `R2_READ_FAILED` | Yes | Yes | No | Retry only while file still exists and is `ready` |
| `JOB_LEASE_EXPIRED` | Yes | Yes | No | Recovered after processor death or stale lease |
| `DECRYPT_FAILED` | No | No | Yes | Use `reindex` only if the underlying file/encryption state changed |
| `SEMANTIC_INDEXING_DISABLED` | No | No | Yes | Returned as `skipped` while the feature is disabled |
| `UNSUPPORTED_MIME` | No | No | Yes | Should normally be prevented by eligibility checks |
| `FILE_TOO_LARGE` | No | No | Yes | Returned as `skipped` when the file exceeds indexing limits |
| `FILE_NOT_READY` | No | No | Yes | Use `reindex` only after file state is corrected |
| `FILE_DELETED` | No | No | Yes | Deleted files must not be reprocessed |
| `PDF_PARSE_FAILED` | No | No | Yes | Use `reindex` only if the file was replaced or the parser changed |
| `VECTOR_DIMENSION_MISMATCH` | No | No | Yes | Use `reindex` only after config or schema is corrected |

> [!IMPORTANT]
> `POST /api/embeddings` means "accepted for processing" and never "fully indexed". The UI, API payloads, cron logic, and test coverage should all reflect that distinction.

---

## Processor Algorithm

The processor should follow this exact high-level algorithm:

1. claim a queued or retryable failed job using a short DB transaction
2. commit the claim
3. load file metadata and verify:
   - file still exists
   - file still belongs to the same user
   - file is `ready`
   - file is not soft-deleted
4. reconstruct decrypted file bytes from the existing encrypted chunk storage
5. build an indexing plan:
   - image -> one item
   - small PDF -> one full-doc item, plus per-page items
   - large PDF -> window items, plus per-page items
6. send each planned item to the embedding provider through Gemini `embedContent`
7. request `outputDimensionality: 1536`
8. validate each returned vector length
9. normalize each vector
10. finalize in a short DB transaction:
    - verify lease ownership
    - replace prior chunk rows safely
    - insert new chunk rows
    - mark job `ready`
11. on failure:
    - map error to a stable `error_code`
    - mark job `failed` or `skipped`
    - release or expire lease metadata safely

Heartbeat rule:

- if provider calls or file work can take long enough to risk lease expiry, update `last_heartbeat_at` through short standalone writes while processing

Failure rule:

- any exception after claiming the job must end in one of:
  - `ready`
  - `failed`
  - `skipped`

Never leave a live attempt stuck in `processing` without lease recovery semantics.

---

## Index Metadata Model

The current schema already provides some of what the new strategy needs:

- `file_id`
- `modality`
- `page_from`
- `page_to`
- `chunk_index`
- `embedding`

To support the updated architecture cleanly, Phase 19 must store:

- `file_id`
- `modality` (`image` | `pdf`)
- `page_from`
- `page_to`
- `chunk_index`
- `chunk_type` (`full` | `window` | `page`)

To support the exact v1 recovery model, Phase 19 must also store on `embedding_jobs`:

- `attempt_count`
- `last_heartbeat_at`
- `lease_expires_at`
- `processor_id`

Codebase-specific note:

- `preview_url` must **not** be persisted
- preview URLs must be derived in the semantic search response using the existing preview/download route conventions

Required schema adjustment:

- add `chunk_type` to `embedding_chunks`

This is simpler and more truthful than trying to infer the chunk kind from page ranges alone.

Do not add attempt-version columns to `embedding_chunks` in v1. The required implementation is one logical job row plus atomic whole-set replacement of chunk rows.

---

## Production Readiness Gaps

The current plan is close, but these items are required before the feature should be treated as production-ready:

- durable execution
  - inline execution is acceptable for local dev and early staging, but broad production rollout should use a durable queue or worker pickup model
- job leasing and stale-job recovery
  - without lease metadata, `processing` jobs can get stuck forever after a crash
- explicit retry classification
  - retry behavior must be driven by stable reason codes rather than ad hoc string matching
- bounded retries and backoff
  - automatic retries need max-attempt limits and retry spacing to avoid hot-loop failures
- concurrency safety
  - duplicate requests from multiple tabs or workers must not create duplicate rows or double-process the same file
- provider backpressure and kill switch
  - the system needs feature flags, concurrency caps, and fast disable paths for provider incidents
- operational visibility
  - logs and metrics must be rich enough to debug failures without logging plaintext document contents
- backfill fairness
  - historical backfills must not starve new upload-triggered jobs
- cleanup guarantees
  - deleted or soft-deleted files must disappear from semantic search immediately and embedding rows must be cleaned up on permanent delete

### DB Atomicity and Locking

Database atomicity is **not automatically taken care of** just because the tables exist. Phase 19 needs explicit transactional rules.

Required transaction boundaries:

- job creation or reuse
  - creating the logical job row for `file_id + modality` must be atomic and protected by the unique constraint
- job claim
  - transitioning `queued` or reclaimable `failed` work into `processing` must use a compare-and-set style update or row lock so only one processor claims the job
- chunk replacement on re-index
  - old chunk deletion plus new chunk insertion must behave as one logical replacement, not as two unrelated steps that can leave the file half-indexed
- terminal status update
  - the job must not be marked `ready` unless the chunk writes for that attempt succeeded

Required implementation rules:

- use a DB transaction for:
  - claiming the job
  - clearing stale chunks for that job
  - inserting replacement chunks
  - updating final job status and timestamps
- keep transactions short and purpose-built
- do not hold DB locks open while:
  - downloading file bytes from R2
  - decrypting large files
  - splitting PDFs
  - calling the embedding provider
- never delete old chunks before the processor is ready to insert the replacement set in the same transactional unit where practical
- for v1, use one short finalize transaction that deletes old rows, inserts the replacement set, and marks the job terminal
- do not introduce attempt-scoped shadow writes or pointer-flip visibility in this phase
- unique indexes and transactions should work together:
  - the unique index prevents duplicate logical jobs
  - the transaction prevents half-finished state changes

Required locking pattern for this codebase:

1. short transaction to claim the job
2. commit immediately
3. do the expensive work outside the transaction
4. short transaction to replace chunks and mark terminal state

This is the safest fit for the current `mysql2` connection pool and avoids holding one of the limited pooled connections during long-running provider calls.

#### Connection-pool compatibility

The current DB layer uses a shared `mysql2/promise` pool under Drizzle with a fixed `connectionLimit` of 10 in `secure-vault/src/lib/db/index.ts`.

That means Phase 19 must follow these best practices:

- keep lock-holding transactions as short as possible
- avoid long-lived transactions around external network calls
- avoid "worker grabs connection and keeps it for the whole embedding attempt" behavior
- update heartbeats with short standalone writes instead of one giant transaction
- cap embedding concurrency so semantic jobs cannot consume all pooled DB connections
- prefer explicit claim/finalize transactions over chatty polling loops

Operational rule of thumb:

- one processor should only hold a DB transaction during claim and finalize phases
- the expensive embedding work should happen after the claim transaction has committed
- cron retry sweeps should page through a bounded batch size instead of scanning and locking large portions of the table

#### Claiming best practices

The claim step must use a single guarded compare-and-set `UPDATE ... WHERE ...` claim pattern.

Whichever pattern is chosen, it must guarantee:

- only one processor can move a job into `processing`
- reclaiming a stale leased job is explicit and auditable
- duplicate tabs, routes, or cron workers cannot both win the claim

Required fields used during claim:

- `status`
- `processor_id`
- `attempt_count`
- `last_heartbeat_at`
- `lease_expires_at`
- `started_at`

#### Finalization best practices

Finalization must use a short transaction that:

- verifies the processor still owns the lease
- deletes or supersedes old chunks for that job
- inserts the replacement chunk set
- updates the job to `ready`, `failed`, or `skipped`
- writes `completed_at` and clears or refreshes lease ownership as appropriate

The finalize transaction must fail closed:

- if lease ownership no longer matches, do not mark the job terminal
- if chunk insertion fails, do not mark the job `ready`
- if status update fails, do not leave partially visible chunks queryable

#### Search visibility rule

Semantic search queries must join through `embedding_jobs` and only read rows where:

- `embedding_jobs.status = 'ready'`
- `embedding_jobs.file_id = embedding_chunks.file_id`

That prevents partially written or stale rows from appearing in results even if a prior attempt crashed.

Production rule:

- semantic search must read only chunks belonging to jobs that are definitively `ready`
- in-progress attempts must never become partially queryable

Test requirements for atomicity:

- two concurrent processors cannot both claim the same job
- a crash after old chunks are cleared but before new chunks are fully committed does not leave the job falsely marked `ready`
- a retry after a partial failure does not surface duplicate or mixed-attempt chunks
- search never returns chunks from a job attempt that did not reach final `ready`
- lock-holding transactions do not remain open during provider calls or large-file processing
- bounded worker concurrency does not exhaust the shared DB connection pool

---

## Target Workflow

1. User uploads a file through the existing upload flow.
2. `/api/upload/complete` marks the file `ready` exactly as it does today.
3. The browser triggers `POST /api/embeddings` only for eligible PDFs and images.
4. The embeddings start route validates auth, ownership, readiness, modality, size limits, and idempotency, then creates or reuses a job row.
5. The processor reconstructs decrypted file bytes from the existing encrypted chunk model.
6. The processor indexes the file using the modality-specific strategy:
   - image -> one embedding per file
   - small PDF -> full-document embedding plus per-page embeddings
   - large PDF -> overlapping-window embeddings plus per-page embeddings
7. The processor persists vectors and metadata into `embedding_chunks`, then marks the job terminal in `embedding_jobs`.
8. `GET /api/embeddings/{fileId}` returns truthful indexing status for upload polling and later file-surface indicators.
9. `POST /api/search/semantic` embeds the query, runs vector retrieval, folds matches by `file_id`, and returns one result card per file.

---

## Search Result Folding

This is a required part of the design, not a UI detail.

Because one PDF can produce many page/window matches, semantic search must:

- group candidate matches by `file_id`
- aggregate or select the best file-level score
- keep the best matching page/window for preview context
- return one result per file

Required v1 behavior:

- primary rank: highest matching chunk score within the file
- tie-breaker: newest file `updated_at`
- preview context:
  - images: file-level result only
  - PDFs: best `page_from` / `page_to`

This matches the current files-page result model better than exposing raw chunk rows to the UI.

---

## Semantic Search Query Rules

The semantic retrieval query must:

- join `embedding_chunks` to `embedding_jobs` and `files`
- filter to:
  - owned files only
  - `files.status = 'ready'`
  - `files.deleted_at IS NULL`
  - `embedding_jobs.status = 'ready'`
- score by vector similarity
- fetch `SEMANTIC_INDEXING_QUERY_TOP_K` chunk candidates internally before folding
- `SEMANTIC_INDEXING_QUERY_TOP_K` must always be greater than or equal to the requested `limit`
- similarity scoring must run on normalized vectors only
- fold by `file_id`
- sort folded results deterministically
- return at most `limit` file results

Required retrieval flow:

1. embed query
2. fetch top `SEMANTIC_INDEXING_QUERY_TOP_K` chunk hits
3. group by `file_id`
4. keep the best chunk per file as preview context
5. sort grouped file hits by best score descending and file freshness as tie-breaker
6. cut to the requested result limit

Required v1 folding and ranking contract:

- similarity metric must be centralized in one query builder/service and used consistently in code and tests
- the representative chunk for a file is the single highest-scoring chunk for that file
- the file-level `score` returned to the client is the representative chunk score, not an average or sum
- `pageFrom`, `pageTo`, and `matchType` must come from the representative chunk
- tie-break order for equal file scores:
  1. most recent `files.updated_at`
  2. lexicographically smaller `fileId`
- if two chunks from the same file have equal score, prefer chunk types in this order:
  1. `page`
  2. `window`
  3. `full`
- ranking and folding rules must be covered by deterministic tests using the fake embedding provider or fixed test vectors

Required v1 values:

- default UI limit: `10`
- default `SEMANTIC_INDEXING_QUERY_TOP_K`: `50`

---

## Frontend Contract

### Upload surface

The upload UI must map status like this:

- upload done + no semantic job needed -> no extra status or `skipped`
- semantic request accepted -> `queued` or `pending`
- job claimed -> `processing`
- embeddings finished -> `ready`
- failed job -> `failed`

Copy rules:

- do not say "complete" when only the trigger route succeeded
- prefer wording like:
  - `Semantic indexing queued`
  - `Semantic indexing in progress`
  - `Semantic indexing ready`
  - `Semantic indexing failed`

### Files page search mode

Add an explicit `semantic` mode to the existing search-mode state.

Behavior:

- `filter`
  - current folder only
  - no network
- `filename`
  - existing global filename search
- `semantic`
  - global semantic retrieval

Switching into `semantic` must clear explorer-only transient state the same way `filename` mode already does.

Disabled/unavailable semantic UX contract:

- when `SEMANTIC_INDEXING_ENABLED=false`, the semantic mode control must remain visible but disabled
- render helper copy explaining that semantic search is unavailable
- do not issue semantic search network requests while disabled
- keep `filter` and `filename` fully functional
- when semantic mode is visible but unavailable because the backend is disabled or misconfigured:
  - render a non-destructive empty/error state
  - do not fall back silently to filename mode
  - do not break explorer state or current-folder browsing
- upload surfaces should still show truthful indexing states such as `skipped` when the feature is disabled server-side

Result-card contract for semantic mode:

- semantic mode must reuse the current files-page search card layout pattern
- semantic mode must not reuse the exact `FilenameSearchResult` TypeScript type unchanged
- define a dedicated `SemanticSearchResult` type in `src/lib/search/types.ts`
- that type must include the fields needed by the card renderer: `fileId`, `name`, `mimeType`, `size`, `updatedAt`, `folderId`, `folderPath`, `isInRoot`, `score`, `pageFrom`, `pageTo`, `matchType`, and `canPreview`
- use a shared display-model type for filename and semantic cards instead of forcing semantic results through the filename DTO

### Open folder behavior

Semantic results must support the same `Open folder` behavior as filename search:

- switch back to normal explorer mode
- navigate to the containing folder
- optionally seed a local file-name filter if that improves discoverability

---

## Cron and Background Retry Contract

If automatic retry is implemented through cron, add a dedicated retry sweep that:

- runs on a schedule
- selects only bounded batches
- only retries retryable failures
- respects `SEMANTIC_INDEXING_MAX_RETRY_ATTEMPTS`
- skips deleted or no-longer-ready files
- does not scan or lock the whole table
- enqueues retry work through `EmbeddingDispatcher`
- never performs full embedding generation inline inside the cron request

Suggested retry sweep algorithm:

1. fetch candidate failed jobs ordered by oldest retryable failure first
2. for each candidate:
   - re-validate file state
   - transition back to `queued` in a compare-and-set-safe way
   - dispatch the job through the configured dispatcher
   - if queue dispatch fails, do not silently lose the job
3. stop when the batch cap or concurrency cap is hit

The retry sweep must be idempotent:

- rerunning the same sweep should not create duplicate work
- already-reclaimed or already-completed jobs should be skipped harmlessly

Required retry-queue behavior:

- the cron route must share the same enqueue path used by manual retry and upload-triggered dispatch
- queue payloads must contain enough identity to re-load the logical job safely, at minimum `jobId`, `fileId`, and `modality`
- the worker must re-check lease ownership and file state before processing queued retry work
- cron should return a summary such as `scanned`, `requeued`, `skipped`, and `dispatchFailures` so operations can tell whether retries were merely selected or actually enqueued
- cron must also serve as Redis reconciliation:
  - find retryable or stranded DB jobs that are eligible for work but missing from active processing
  - re-enqueue them safely into Redis without creating duplicate logical jobs

---

## Observability and Ops Contract

Every processing attempt should log:

- `jobId`
- `fileId`
- `userId`
- `modality`
- `processorId`
- `attemptCount`
- `status`
- `errorCode`
- provider latency
- total processing latency

Never log:

- plaintext document content
- decrypted bytes
- raw embedding vectors

Minimum metrics to capture:

- accepted jobs per minute
- ready jobs per minute
- failed jobs per minute
- retry count
- p50/p95 job duration
- p50/p95 semantic search latency

Minimum dashboards or operational views:

- recent failure codes
- stuck jobs near lease expiry
- retry storm detection
- pool pressure or DB timeout indicators if available

---

## Detailed Tasks

- [ ] **19.1 - Add semantic-indexing config, shared eligibility, and provider bootstrap**
  - Files:
    - `secure-vault/package.json`
    - `secure-vault/.env.example`
    - `secure-vault/src/lib/constants/upload.ts`
    - `secure-vault/src/lib/ai/config.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/eligibility.ts` (new)
    - `secure-vault/src/lib/ai/providers/google.ts` (new)
    - `secure-vault/src/lib/ai/providers/fake.ts` (new)
  - Add runtime dependencies:
    - `pdf-lib`
    - `@google/genai`
  - Add feature/config flags for:
    - `SEMANTIC_INDEXING_ENABLED`
    - `SEMANTIC_INDEXING_EXECUTION_MODE`
    - `SEMANTIC_INDEXING_PROVIDER`
    - `GEMINI_API_KEY`
    - `GEMINI_EMBEDDING_MODEL`
    - PDF size thresholds
    - PDF page-window settings
  - Include a deterministic fake embedding provider path for tests and local non-provider development.
  - Move semantic eligibility out of `upload-job.ts` into a shared helper.
  - Eliminate the current MIME drift so `image/avif` behaves consistently.
  - Freeze provider enums to `google | fake` and execution-mode enums to `inline | queued`.
  - Freeze the v1 Google provider package to `@google/genai` and the default embedding model to `gemini-embedding-2-preview`.
  - Freeze the provider call contract to `models.embedContent(..., { config: { outputDimensionality: 1536 } })`.
  - Normalize stored and query vectors after embedding generation.
  - Validate that configured embedding dimensions match the schema-fixed `vector(1536)`.
  - Acceptance criteria:
    - config fails fast on invalid execution mode or dimension mismatch
    - client and server share the same semantic-eligibility decision
    - disabling semantic indexing does not affect upload success
    - fake-provider mode is available for automated tests without reaching the real provider

- [ ] **19.2 - Reconcile the embedding schema with the new chunk model**
  - Files:
    - `secure-vault/src/lib/db/schema/embedding-jobs.ts`
    - `secure-vault/src/lib/db/schema/embedding-chunks.ts`
    - `secure-vault/src/lib/db/schema/_custom-types.ts`
    - `secure-vault/drizzle/*`
  - Keep the existing tables, but evolve them instead of recreating them.
  - Add what Phase 19 now actually needs:
    - `chunk_type` on `embedding_chunks`
    - required job-recovery metadata on `embedding_jobs`: `attempt_count`, `last_heartbeat_at`, `lease_expires_at`, `processor_id`
  - Preserve uniqueness and idempotency around `file_id + modality`.
  - Keep one logical `embedding_jobs` row per `file_id + modality`; do not add a second attempts table in v1.
  - Add a forward-only migration because the repo currently stops at `0008_*`.
  - Acceptance criteria:
    - duplicate start requests cannot create duplicate jobs
    - re-indexing does not accumulate stale chunk rows
    - chunk metadata can represent `full`, `window`, and `page` records cleanly

- [ ] **19.3 - Extract a shared decrypted-file reader for indexing**
  - Files:
    - `secure-vault/src/lib/files/file-bytes.ts` (new)
    - `secure-vault/src/app/api/files/[id]/service.ts`
  - Factor reusable logic from the current download/preview pipeline so indexing can load decrypted bytes without duplicating FEK, chunk, or R2 logic.
  - The new utility should:
    - load a ready owned file
    - validate ordered chunk metadata
    - decrypt FEK
    - reconstruct file bytes from R2 chunks
  - Acceptance criteria:
    - indexing reads exactly the same decrypted bytes the download service would stream
    - there is still only one authoritative encrypted-file reconstruction path

- [ ] **19.4 - Implement the embeddings start/status API and job service**
  - Files:
    - `secure-vault/src/app/api/embeddings/route.ts` (new)
    - `secure-vault/src/app/api/embeddings/[fileId]/route.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/embedding-job-service.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/embedding-job-repository.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/dispatcher.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/inline-dispatcher.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/queue-dispatcher.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/redis-queue.ts` (new)
  - `POST /api/embeddings` must:
    - require auth
    - validate `{ fileId, modality, action? }`
    - confirm ownership and `files.status = 'ready'`
    - confirm semantic eligibility
    - create or reuse the job row
    - dispatch work without claiming success prematurely
    - enforce `retry` only for retryable failed jobs
    - enforce `reindex` as the only human rerun path for non-retryable failed jobs
  - `GET /api/embeddings/{fileId}` must:
    - require auth
    - confirm ownership
    - return truthful job state, reason codes, and timestamps
  - Dispatcher rules:
    - upload-triggered starts and manual retries go through `EmbeddingDispatcher`
    - `QueuedEmbeddingDispatcher` must define the enqueue payload contract used later by cron and backfill flows
    - queue mode must push lightweight work items into Redis rather than running the processor inline inside the route handler
  - Acceptance criteria:
    - repeated requests are idempotent
    - the route returns job acceptance/status, not fake completion
    - the service can later move behind a durable worker without rewriting callers
    - queue mode has a real enqueue path rather than a placeholder seam
    - Redis queue push failures leave DB jobs recoverable for later cron reconciliation

- [ ] **19.4a - Implement the Redis worker runtime and container topology**
  - Files:
    - `secure-vault/package.json`
    - `secure-vault/scripts/embedding-worker.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/worker.ts` (new)
    - `compose.yaml`
    - `secure-vault/.env.example`
    - optional container entrypoint/supervisor file only if the team intentionally runs multiple processes in one container
  - Production assumption:
    - this app is deployed as a containerized self-hosted system, not as a Vercel-first serverless app
    - Next.js route handlers remain coordination endpoints only
    - the embedding worker runs as a separate long-lived process from the same repo and same built image
  - Worker rules:
    - bootstrap config, Redis, and DB connectivity on startup
    - block on the Redis queue and process messages continuously
    - re-load job state from MariaDB before claiming work
    - update heartbeat/lease metadata while processing long-running jobs
    - support graceful shutdown so in-flight jobs either finish or become reclaimable safely
  - Container/runtime rules:
    - prefer one built image with two services/containers:
      - web -> `next start`
      - worker -> `npm run worker:embeddings`
    - do not rely on Next.js route handlers to keep background loops alive
    - do not require a second repo, second TypeScript config, or second env scheme for the worker
    - if a single container runs both processes, it must use a real supervisor and this should be treated as an exception, not the default topology
  - Acceptance criteria:
    - the repo exposes a concrete worker entrypoint and package script
    - the container topology shows how web and worker run separately from the same codebase/image
    - queued production mode is invalid unless Redis and the worker process are configured
    - worker crash/restart behavior is delegated to the container runtime or service supervisor, not to Next.js

- [ ] **19.5 - Implement PDF splitting and indexing plans**
  - Files:
    - `secure-vault/src/lib/ai/embeddings/pdf-page-plan.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/pdf-splitter.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/types.ts` (new)
  - Use `pdf-lib` to:
    - read page count
    - produce in-memory PDF payloads for:
      - full document chunks
      - overlapping window chunks
      - per-page chunks
  - Enforce the strategy:
    - `<= 6` pages -> full document
    - `> 6` pages -> windows of exactly 6 pages with 1-page overlap, with the final window allowed to be shorter
    - all PDFs -> per-page embeddings in addition to full/window embeddings
  - Acceptance criteria:
    - window boundaries are deterministic
    - `page_from` and `page_to` are always accurate
    - no OCR is required for the default PDF path

- [ ] **19.6 - Implement direct multimodal embedding and persistence workflow**
  - Files:
    - `secure-vault/src/lib/ai/embeddings/embedder.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/embedding-processor.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/persist-embeddings.ts` (new)
  - Image behavior:
    - one image chunk -> one multimodal embedding
  - PDF behavior:
    - full, window, and page chunks -> multimodal embeddings
  - Embedding rules:
    - use the latest documented query/document formatting contract for retrieval
    - request `outputDimensionality: 1536`
    - normalize vectors after embedding generation
    - returned vectors must be validated against the schema dimension
  - Persistence rules:
    - safe replacement on re-index
    - terminal job status only after chunk writes succeed
  - Acceptance criteria:
    - image indexing works without OCR
    - PDF indexing works from direct multimodal embeddings
    - retries do not leave duplicate chunk rows

- [ ] **19.7 - Implement semantic retrieval service and API**
  - Files:
    - `secure-vault/src/app/api/search/semantic/route.ts` (new)
    - `secure-vault/src/lib/search/types.ts`
    - `secure-vault/src/lib/search/semantic/query-embedder.ts` (new)
    - `secure-vault/src/lib/search/semantic/semantic-search.ts` (new)
    - `secure-vault/src/lib/search/semantic/semantic-search-query.ts` (new)
    - `secure-vault/src/lib/search/semantic/index.ts` (new)
  - Extend search types to include:
    - `SearchMode = "filter" | "filename" | "semantic"`
    - semantic result DTOs
  - `POST /api/search/semantic` must:
    - require auth
    - validate query and limit using the exact v1 rules: trimmed query length `2..500`, default `limit=10`, allowed `limit=1..25`
    - embed the query through `embedContent` using the exact retrieval query format defined in this spec
    - normalize the query vector before similarity search
    - search vectors joined back to `files`
    - exclude soft-deleted and non-ready files
    - fold results by `file_id`
    - fetch exactly `SEMANTIC_INDEXING_QUERY_TOP_K` chunk candidates before folding
    - apply the documented file-level score and tie-break rules literally
  - Response DTO should include:
    - `fileId`
    - `name`
    - `mimeType`
    - `size`
    - `updatedAt`
    - `score`
    - `pageFrom`
    - `pageTo`
    - `folderId`
    - `folderPath`
    - `isInRoot`
    - `matchType`
    - `canPreview`
  - Acceptance criteria:
    - one card per file in the first page of results
    - file ownership and `deleted_at` scoping remain intact
    - the retrieval service is reusable later by Phase 16
    - ranking is deterministic for fixed vectors and covered by tests

- [ ] **19.8 - Add semantic mode to the existing files-page search UX**
  - Files:
    - `secure-vault/src/components/files/toolbar.tsx`
    - `secure-vault/src/components/files/files-library.tsx`
    - `secure-vault/src/components/files/file-search-results.tsx`
    - `secure-vault/src/components/files/files-empty-state.tsx`
    - `secure-vault/src/hooks/use-semantic-search-query.ts` (new)
  - Add semantic as a third explicit mode beside `filter` and `filename`.
  - Preserve current behavior:
    - `filter` stays local and default
    - `filename` keeps its current API-backed behavior
    - `semantic` is opt-in and isolated
  - UI requirements:
    - one result card per file
    - page-range context for PDFs
    - helper text that explains this is semantic, not exact-match search
    - `Open folder` continues to work using the existing result pattern
    - disabled/unavailable semantic mode follows the explicit UX contract instead of silently falling back to filename search
  - Acceptance criteria:
    - no regressions to `filter` or `filename`
    - semantic search feels like an extension of the existing files UI, not a separate product
    - disabled semantic mode does not issue semantic network requests and does not break explorer behavior

- [ ] **19.9 - Make upload indexing status truthful**
  - Files:
    - `secure-vault/src/lib/upload/upload-job.ts`
    - `secure-vault/src/components/upload/upload-dialog.tsx`
    - `secure-vault/src/components/upload/upload-provider.tsx`
  - Replace the current optimistic trigger behavior:
    - `POST /api/embeddings` success means "accepted", not "complete"
  - Required behavior:
    - local state becomes `pending`
    - the client polls `GET /api/embeddings/{fileId}`
    - UI shows `queued`, `processing`, `ready`, `skipped`, or `failed`
  - Reuse the existing React Query invalidation pattern already used for files, storage dashboard, and current user data.
  - Acceptance criteria:
    - upload success remains separate from indexing status
    - indexing failure never rolls back a successful upload
    - the UI no longer says "Semantic indexing triggered" when the job is not actually done

- [ ] **19.10 - Add rollout, backfill, and operational guardrails**
  - Files:
    - `tasks/phase-19-pdf-semantic-indexing.md`
    - `secure-vault/src/app/api/cron/embeddings/route.ts` (required)
    - `secure-vault/scripts/backfill-semantic-indexing.ts` (new, optional)
    - `secure-vault/scripts/check-semantic-health.ts` (new, optional)
    - worker entrypoint or process wrapper for Redis queue consumption under `secure-vault/scripts/*` or equivalent runtime location
  - Rollout order:
    - ship behind `SEMANTIC_INDEXING_ENABLED`
    - enable for new uploads first
    - add historical backfill later
  - Backfill rules:
    - dry-run mode
    - bounded concurrency
    - idempotent enqueue behavior
    - must not starve foreground upload-triggered jobs
  - Cron retry rules:
    - select retryable failed jobs in bounded batches
    - reset them safely to `queued`
    - enqueue them through the dispatcher/queue path
    - return operational counts for `scanned`, `requeued`, `skipped`, and `dispatchFailures`
  - Worker/runtime rules:
    - the worker consumes Redis queue messages outside the Next.js request lifecycle
    - route handlers remain short-lived enqueue/status endpoints
    - self-hosted production must run the worker process separately from `next start`
  - Acceptance criteria:
    - the feature can be disabled instantly
    - rollout does not require manual SQL or route poking
    - cron retry has a concrete queue/enqueue implementation, not only a future placeholder
    - Redis queue plus DB reconciliation is the required v1 production path

---

## Explicit Non-Goals for v1

These ideas are valid, but they are not part of the first working version:

- full OCR pipeline as a hard dependency
- exact sentence lookup
- hybrid lexical + semantic reranking
- legal/compliance-grade clause retrieval
- storing signed preview URLs in the database
- replacing filename search with semantic search

---

## Future Enhancements

Once the core semantic pipeline is working, the next upgrades should be:

- selective OCR for text-heavy images and scans
- hybrid retrieval:
  - semantic retrieval -> top-k -> OCR or exact-match rerank on demand
- richer snippet extraction for PDFs
- query-intent routing between filename, semantic, and exact-match paths

Future hybrid flow:

```text
query -> semantic retrieval -> top-k files/chunks -> OCR or exact-match refinement -> rerank
```

---

## Deliverables

| Output | Location |
| --- | --- |
| Embeddings start route | `secure-vault/src/app/api/embeddings/route.ts` |
| Embeddings status route | `secure-vault/src/app/api/embeddings/[fileId]/route.ts` |
| Semantic search route | `secure-vault/src/app/api/search/semantic/route.ts` |
| Cron retry route | `secure-vault/src/app/api/cron/embeddings/route.ts` |
| Shared AI config/provider bootstrap | `secure-vault/src/lib/ai/config.ts`, `secure-vault/src/lib/ai/providers/google.ts`, `secure-vault/src/lib/ai/providers/fake.ts` |
| Shared decrypted file reader | `secure-vault/src/lib/files/file-bytes.ts` |
| Embedding job service + dispatcher | `secure-vault/src/lib/ai/embeddings/*` |
| Multimodal embedder | `secure-vault/src/lib/ai/embeddings/embedder.ts` |
| Worker runtime + bootstrap | `secure-vault/src/lib/ai/embeddings/worker.ts`, `secure-vault/scripts/embedding-worker.ts` |
| Container topology for web + worker | `compose.yaml`, `secure-vault/package.json` |
| PDF page-plan + splitter | `secure-vault/src/lib/ai/embeddings/pdf-*.ts` |
| Semantic retrieval service | `secure-vault/src/lib/search/semantic/*` |
| Semantic search hook/UI integration | `secure-vault/src/hooks/use-semantic-search-query.ts`, `secure-vault/src/components/files/*` |
| Upload status hardening | `secure-vault/src/lib/upload/upload-job.ts`, `secure-vault/src/components/upload/upload-dialog.tsx` |
| Forward-only migration | `secure-vault/drizzle/0009_semantic_indexing.sql` or equivalent next migration |

---

## Execution Order

1. Finalize shared eligibility, config, and schema constraints.
2. Add the forward-only migration for chunk metadata and recovery fields.
3. Extract the shared decrypted file reader from the existing download path.
4. Build the job repository/service and embeddings start/status routes.
5. Add the Redis worker entrypoint and container topology for separate web/worker processes.
6. Implement PDF page planning and PDF splitting with `pdf-lib`.
7. Implement direct multimodal embeddings for images and PDFs.
8. Add semantic retrieval and file-level result folding.
9. Integrate semantic mode into the files UI.
10. Make upload indexing status truthful.
11. Add rollout scripts, backfill support, and recovery tooling.

---

## Testing

### Automated Tests (Vitest)

Run at minimum:

```bash
npx vitest run tests/upload tests/search tests/download tests/embeddings
```

Create or extend:

| Test file | Coverage |
| --- | --- |
| `secure-vault/tests/embeddings/config.test.ts` | env validation, dimension mismatch rejection, feature flag behavior |
| `secure-vault/tests/embeddings/fake-provider.test.ts` | deterministic vectors, provider selection rules, production guardrails |
| `secure-vault/tests/embeddings/eligibility.test.ts` | supported MIME types, AVIF parity, PDF size caps |
| `secure-vault/tests/embeddings/file-bytes.test.ts` | FEK decryption, chunk ordering, missing R2 objects, corrupt metadata |
| `secure-vault/tests/embeddings/pdf-page-plan.test.ts` | small-PDF full-doc strategy, large-PDF windows, overlap correctness |
| `secure-vault/tests/embeddings/pdf-splitter.test.ts` | page extraction, window extraction, deterministic page ranges |
| `secure-vault/tests/embeddings/embedding-job-service.test.ts` | idempotent start, retry semantics, stale-job recovery |
| `secure-vault/tests/embeddings/queue-dispatcher.test.ts` | enqueue payload shape, dispatch failure handling, cron/manual/upload parity |
| `secure-vault/tests/embeddings/redis-queue.test.ts` | Redis queue contract, worker claim behavior, duplicate delivery tolerance |
| `secure-vault/tests/embeddings/worker-runtime.test.ts` | worker bootstrap, graceful shutdown, queue-consume loop, config failure behavior |
| `secure-vault/tests/embeddings/embedding-processor.test.ts` | image multimodal embedding, PDF multimodal embedding, vector dimension checks, normalization, safe replacement |
| `secure-vault/tests/embeddings/embeddings-route.test.ts` | `401`, `400`, `404`, `202`, exact error payloads, and idempotent re-trigger behavior |
| `secure-vault/tests/embeddings/embeddings-status-route.test.ts` | ownership scope, state payload shaping, failure codes |
| `secure-vault/tests/embeddings/cron-embeddings-route.test.ts` | bounded retry sweep, retryable-only enqueue, idempotent requeue behavior |
| `secure-vault/tests/search/semantic-search.test.ts` | query embedding contract, file-level folding, deleted-file exclusion, ready-only results |
| `secure-vault/tests/search/semantic-route.test.ts` | route validation, blank query rejection, limit handling |
| `secure-vault/tests/files/files-library.test.tsx` | semantic mode UI states, open-folder behavior, no regressions to `filter` or `filename` |
| `secure-vault/tests/upload/upload-job.test.ts` | truthful indexing lifecycle after `/api/embeddings` acceptance |

Required assertions:

- duplicate `POST /api/embeddings` calls do not create duplicate jobs or chunk rows
- `action="retry"` and `action="reindex"` follow explicit success/rejection rules instead of implicit duplicate-POST behavior
- semantic eligibility is consistent between client and server
- fake-provider mode returns deterministic vectors and is rejected in production config
- stored document vectors and query vectors are normalized before similarity comparison
- small PDFs use full-document indexing
- large PDFs use overlapping windows with correct page ranges
- eligible images index as one semantic object by default
- semantic search never returns another user's files
- semantic search never returns soft-deleted or non-ready files
- multiple matching chunks from one file fold into one file-level result
- folded file scores, representative chunks, and tie-break ordering follow the documented ranking contract exactly
- upload success is never coupled to indexing success
- accepted jobs are not presented as completed jobs in the UI
- disabled semantic mode does not issue semantic search requests and does not silently fall back to filename search
- only retryable `error_code` values are eligible for cron-driven automatic retry
- non-retryable failures remain terminal unless a human explicitly uses `action="reindex"` after fixing the underlying issue
- retries do not create duplicate chunk rows
- stale `processing` jobs can be reclaimed safely
- retry attempts stop at the configured max-attempt threshold
- cron retry enqueues work through the queue dispatcher instead of processing embeddings inline
- cron dispatch failures are surfaced and do not silently drop retry candidates
- Redis message redelivery or duplicate enqueue does not create duplicate processing side effects because DB claim logic remains authoritative

### End-to-End Tests (Playwright)

Add or extend:

```bash
npx playwright test tests/e2e/storage-search.spec.ts tests/e2e/upload-smoke.spec.ts tests/e2e/file-access.spec.ts
```

Recommended scenarios:

1. Upload a small PDF and verify:
   - upload completes immediately
   - semantic status progresses independently
   - semantic search later finds it

2. Upload a large PDF and verify:
   - upload succeeds
   - indexing windows are used
   - search returns one file card with page-range context

3. Upload an eligible image and verify:
   - indexing starts
   - semantic search later finds it

4. Force an embedding-provider failure and verify:
   - upload remains successful
   - file preview/download still work
   - semantic status shows failure without breaking the library

5. Trigger a retryable failure and verify:
   - the job moves to `failed`
   - a route retry or cron pickup can requeue it through the same dispatcher path
   - the eventual success path does not create duplicate semantic rows

6. Trigger a non-retryable failure and verify:
   - the job moves to `failed` or `skipped`
   - cron does not keep retrying it automatically
   - `action="retry"` is rejected
   - `action="reindex"` is the supported manual rerun path after the underlying issue is fixed

7. Trigger cron retry sweep and verify:
   - the cron route reports bounded `requeued` counts
   - the retry candidate is enqueued, not processed inline in the request
   - the worker path later processes the queued retry successfully

8. Soft-delete an indexed file and verify:
   - semantic search stops returning it immediately

9. Use semantic mode in the files page and verify:
   - results render separately from the explorer
   - `Open folder` returns to normal browsing cleanly

10. Disable semantic indexing and verify:
   - the semantic mode control follows the documented disabled/unavailable UX
   - no semantic search request is sent from the files page
   - upload success and filename search continue to work normally

---

## Rollout Notes

- Default the feature to off until migrations and provider credentials are verified.
- Enable for new uploads first.
- Backfill historical content only after the foreground path is stable.
- Track at minimum:
  - job success rate
  - failure rate by reason code
  - processing latency by modality
  - semantic search latency

---

## Definition of Done

- Semantic indexing works end-to-end for supported PDFs and images using direct multimodal embeddings with `gemini-embedding-2-preview`.
- Small PDFs use whole-document indexing; larger PDFs use overlapping windows.
- The semantic pipeline reuses the existing encrypted file-storage and decrypted-read path.
- Semantic search is auth-scoped, file-oriented, and deduplicated by `file_id`.
- The files page supports an explicit `semantic` mode without regressing `filter` or `filename`.
- Upload status reflects the real indexing lifecycle instead of optimistic trigger acceptance.
- The feature is rollout-safe behind config flags and leaves a clean retrieval seam for Phase 16.

---

## One-Line Summary

> Use direct multimodal embeddings with `gemini-embedding-2-preview`, index images as single semantic objects, split large PDFs into overlapping windows plus pages, normalize 1536-dimensional vectors for storage and query-time similarity, and fold chunk matches back to one result per file so semantic search fits the current SecureVault architecture cleanly.
