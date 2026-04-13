# Phase 19 - Semantic Indexing & Search

> **Objective:** Add a production-grade post-upload semantic indexing pipeline that remains outside the encrypted upload critical path, works for PDFs and eligible images, and plugs into the existing files/search UX without regressing current behavior.

**Depends on:** Phase 1 (DB), Phase 4 (Upload), Phase 5 (Download/Preview), Phase 14 (Storage & Search)  
**Related phase:** Phase 16 (AI Agent)  
**Blueprint ref:** Sections 3 (Upload Flow), 7 (AI Agent), 8 (Schema), 19 (Search & Filter)

> [!IMPORTANT]
> This phase is additive. Upload, download, preview, share links, trash behavior, storage usage, and filename search must continue to work exactly as before even when semantic indexing is unavailable, skipped, or failed.

---

## Current Implementation Snapshot

- [x] `secure-vault/src/lib/upload/upload-job.ts` already triggers `POST /api/embeddings` after `/api/upload/complete` succeeds for eligible PDFs and images.
- [x] `secure-vault/src/components/upload/upload-dialog.tsx` already has additive indexing status copy in the upload UI.
- [x] `secure-vault/src/lib/db/schema/embedding-jobs.ts` and `secure-vault/src/lib/db/schema/embedding-chunks.ts` already exist and are exported from `secure-vault/src/lib/db/schema/index.ts`.
- [x] Filename search already exists end-to-end through `secure-vault/src/lib/search/*`, `secure-vault/src/hooks/use-filename-search-query.ts`, and `secure-vault/src/app/api/search/files/route.ts`.
- [x] File decryption and streaming already exist in `secure-vault/src/app/api/files/[id]/service.ts`.
- [ ] `secure-vault/src/app/api/embeddings/*` is still a placeholder.
- [ ] `secure-vault/src/lib/ai/*` and `secure-vault/src/lib/ai/ocr/*` are still placeholders.
- [ ] There is no real semantic retrieval service, vector query route, OCR pipeline, or embedding persistence workflow.
- [ ] The current client upload flow treats a successful `POST /api/embeddings` response as effectively "complete", which is not truthful once real background/long-running indexing exists.
- [ ] Semantic indexing eligibility is currently duplicated and already drifting:
  - `secure-vault/src/lib/constants/upload.ts` allows `image/avif`
  - `secure-vault/src/lib/upload/upload-job.ts` semantic-trigger logic does not currently include `image/avif`
- [ ] `secure-vault/src/lib/db/schema/_custom-types.ts` currently hardcodes `vector(1536)`, so runtime dimensionality must be validated centrally instead of being treated as a free env var.

> [!NOTE]
> Phase 19 should build on these seams rather than redoing upload or search from scratch.

---

## Scope

This phase owns:

- Semantic indexing job orchestration for supported file modalities
- PDF text extraction with OCR fallback
- Image embedding support
- Secure embedding/reference persistence
- Semantic search backend and files-page UI integration
- Truthful job status reporting and retry behavior
- Reusable retrieval services for future chat/agent work

This phase does **not** own:

- General-purpose chat UI
- Non-PDF document parsing beyond the explicitly supported modalities
- Reworking the upload architecture
- Replacing filename search with hybrid ranking in the first pass
- Vendor lock-in beyond a clean provider abstraction

---

## Architecture Guardrails

- Keep `/api/upload/complete` focused on upload completion only. Do not move OCR or embedding generation into that route.
- Do not rely on "return `200` and keep working in the background" inside a Next.js route as the production execution model. The phase should ship behind a dispatcher boundary that can run inline in dev/test and move to a durable queue/worker in production without rewriting the processor.
- Keep route handlers thin: auth, validation, response shaping, and error mapping only.
- Put orchestration and processing logic under `src/lib/ai/embeddings/`.
- Put OCR provider contracts under `src/lib/ai/ocr/`.
- Put semantic retrieval logic under `src/lib/search/semantic/`.
- Reuse the existing file decryption and chunk-streaming path where possible. Do not create a second incompatible file-read implementation.
- Centralize modality eligibility and size caps in shared constants/helpers so client and server cannot drift.
- Never store extracted text in plaintext. If reference/snippet text is persisted, encrypt it with a key derived from the file FEK and a fixed context string.
- Keep vector dimensionality fixed to the schema-supported size for this phase. Do not silently accept env values that disagree with the DB schema.
- All APIs and retrieval must stay auth-scoped by `userId`, `files.status = 'ready'`, and `deleted_at IS NULL`.
- Search results must never surface content from another user, from soft-deleted files, or from files whose indexing job failed/skipped.
- A successfully accepted indexing request is **not** the same thing as an indexed file. The UI and API contracts must reflect the real job lifecycle.
- Design the processor so it can later move behind a queue/worker without rewriting extraction, chunking, or search services.
- OCR must be capability-based rather than vendor-shaped. The processor should support providers that accept full PDFs, rendered page images, or only page subsets, so adapters for Gemini OCR, DeepSeek OCR, or GLM OCR can be added without changing the processor flow.
- Semantic retrieval is chunk-level internally but should be file-oriented at the API/UI boundary so one large PDF does not flood the first page of results with duplicate cards.

### Recommended Runtime Model

Use a dispatcher abstraction from day one:

- `EmbeddingDispatcher`
- `InlineEmbeddingDispatcher` for local dev/test or non-serverless deployments
- `QueuedEmbeddingDispatcher` as the production target

`POST /api/embeddings` should validate and create or reuse the job, then hand execution to the dispatcher. The route should not claim semantic success merely because it accepted work.

### Recommended Job Lifecycle Metadata

The existing schema is close, but production behavior is safer if `embedding_jobs` also tracks:

- `attempt_count`
- `last_heartbeat_at`
- `lease_expires_at`
- `processor_id` or an equivalent processing token

That gives Phase 19 an explicit stale-job recovery story instead of leaving `processing` rows stuck forever after a crash.

---

## Target Workflow

1. User uploads a file through the existing upload flow.
2. `/api/upload/complete` marks the file `ready` and returns success as it does today.
3. The browser triggers `POST /api/embeddings` only for eligible, supported files.
4. The embeddings start route validates auth, ownership, readiness, modality, and idempotency, then creates or reuses a job row and dispatches processing through the configured execution mode.
5. A reusable processor reads and decrypts the file, extracts modality-specific content, creates embeddings, and persists chunks plus metadata.
6. `GET /api/embeddings/{fileId}` returns truthful status for upload UI polling and later files-page surfacing.
7. `POST /api/search/semantic` embeds the query, performs auth-scoped vector retrieval, deduplicates to the best result per file for the v1 UI, and returns modality-aware results for the files UI.

---

## Detailed Tasks

- [ ] **19.1 - Add semantic-indexing config, shared constants, and provider bootstrapping**
  - Files:
    - `secure-vault/package.json`
    - `secure-vault/.env.example`
    - `secure-vault/src/lib/constants/upload.ts`
    - `secure-vault/src/lib/ai/config.ts` (new)
    - `secure-vault/src/lib/ai/providers/google.ts` (new)
  - Add runtime dependencies:
    - `ai`
    - `@ai-sdk/google`
    - `pdfjs-dist`
  - Add and document env vars:
    - `SEMANTIC_INDEXING_ENABLED`
    - `SEMANTIC_INDEXING_EXECUTION_MODE=inline|queue`
    - `GOOGLE_GENERATIVE_AI_API_KEY`
    - `PDF_EMBEDDING_MAX_BYTES`
    - `PDF_EMBEDDING_MODEL`
    - `PDF_EMBEDDING_DIMENSIONS`
    - `PDF_OCR_PROVIDER`
    - `IMAGE_EMBEDDING_MODEL`
    - `IMAGE_EMBEDDING_DIMENSIONS`
    - provider-level safeguards such as `OCR_TIMEOUT_MS`, `EMBEDDING_TIMEOUT_MS`, and `SEMANTIC_INDEXING_MAX_CONCURRENCY`
  - Recommended production guardrail:
    - `SEMANTIC_INDEXING_ENABLED=true` as a kill switch for rollout safety
  - Validate config in one place and fail with actionable messages.
  - Enforce that configured dimensions match the actual DB schema size used in `embedding_chunks.embedding`.
  - Move semantic-indexing file eligibility into a shared helper instead of duplicating logic in `upload-job.ts`.
  - Fix the current image MIME drift so client and server agree on the exact supported image allowlist.
  - Acceptance criteria:
    - config fails fast on invalid execution mode, missing provider keys, or vector-dimension mismatch
    - client and server semantic eligibility decisions come from the same helper
    - turning the kill switch off skips semantic work without affecting upload success

- [ ] **19.2 - Reconcile and harden the embedding schema plus forward migrations**
  - Files:
    - `secure-vault/src/lib/db/schema/embedding-jobs.ts`
    - `secure-vault/src/lib/db/schema/embedding-chunks.ts`
    - `secure-vault/src/lib/db/schema/_custom-types.ts`
    - `secure-vault/drizzle/*`
  - Keep the existing tables, but verify they are sufficient for production behavior rather than re-adding them blindly.
  - Confirm or add the following fields/indexes if anything is missing:
    - `embedding_jobs`
      - one row per `file_id + modality`
      - `queued | processing | ready | skipped | failed`
      - `error_code`, `error_message`
      - recommended: `attempt_count`, `last_heartbeat_at`, `lease_expires_at`, `processor_id`
      - `started_at`, `completed_at`, `updated_at`
    - `embedding_chunks`
      - `job_id`, `file_id`, `chunk_index`
      - `modality`
      - optional page metadata and optional encrypted reference text
      - `VECTOR(1536)` or the chosen fixed dimension
  - Verify the uniqueness constraints support idempotent re-triggering and safe replacement.
  - Verify the vector index exists and uses cosine distance if supported by the target MariaDB version.
  - If production DBs may already be on a state without the needed vector index or supporting metadata, add a forward-only migration rather than editing history.
  - Add migration notes for local dev, CI, and staging rollout.
  - Acceptance criteria:
    - duplicate start requests cannot create duplicate jobs
    - retries cannot accumulate stale chunk rows
    - stale `processing` jobs can be detected and re-queued safely

- [ ] **19.3 - Extract a shared decrypted-file reader for indexing**
  - Files:
    - `secure-vault/src/lib/files/file-bytes.ts` (new) or `secure-vault/src/lib/storage/file-content.ts` (new)
    - `secure-vault/src/app/api/files/[id]/service.ts`
    - `secure-vault/src/lib/ai/embeddings/types.ts` (new)
  - Factor the reusable pieces of the current download/decrypt path so indexing can read file bytes without duplicating chunk metadata logic.
  - Target capability:
    - load ready file metadata for an owned file
    - decrypt FEK
    - fetch and decrypt all chunks in order
    - return a `Buffer` for small supported indexing inputs
  - Guardrails:
    - only allow indexing on files already marked `ready`
    - reject when chunk metadata is incomplete or inconsistent
    - fail safely if an R2 object is missing or decryption fails
  - Do not break the existing download/preview service while extracting this shared utility.
  - Acceptance criteria:
    - byte output matches the existing download/decrypt path for the same file
    - indexing does not duplicate FEK/chunk metadata logic that already exists in the download service

- [ ] **19.4 - Build job orchestration and the embeddings start/status APIs**
  - Files:
    - `secure-vault/src/app/api/embeddings/route.ts`
    - `secure-vault/src/app/api/embeddings/[fileId]/route.ts`
    - `secure-vault/src/lib/ai/embeddings/embedding-job-service.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/embedding-job-repository.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/eligibility.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/dispatcher.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/inline-dispatcher.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/queue-dispatcher.ts` (new or reserved seam)
  - `POST /api/embeddings` responsibilities:
    - require auth
    - validate `{ fileId, modality }`
    - verify ownership
    - verify `files.status === 'ready'`
    - verify modality-specific eligibility
    - create or reuse the single job row for `fileId + modality`
    - dispatch work without waiting for extraction or embedding completion
  - Idempotency rules:
    - if job is `queued`, `processing`, or `ready`, return it instead of creating duplicate work
    - if job is `failed`, allow safe retry by replacing prior chunks within the same logical job or by resetting state before reprocessing
    - if job is `skipped`, only reprocess when the skip reason has been resolved or when explicitly retried with valid inputs
  - Concurrency rules:
    - only one processor may transition a job into `processing`
    - use compare-and-set style DB updates or equivalent transactional locking
    - repeated requests from two tabs must not create duplicate chunk rows
  - `GET /api/embeddings/{fileId}` responsibilities:
    - require auth
    - verify ownership
    - return modality-aware status for the caller's file
    - include machine-readable reason codes for `failed` and `skipped`
    - include timestamps so the UI can distinguish queued vs long-running vs recovered work
  - Keep the processor behind a service boundary so the route can later hand off to a background worker without changing callers.
  - Important production rule:
    - do not implement route-level fire-and-forget work that is only reliable while the same request process remains alive

- [ ] **19.5 - Implement native PDF text extraction first**
  - Files:
    - `secure-vault/src/lib/ai/embeddings/pdf-text-extractor.ts`
    - `secure-vault/src/lib/ai/embeddings/pdf-text-normalizer.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/pdf-text-quality.ts` (new)
  - Use `pdfjs-dist` to parse decrypted PDF bytes page by page.
  - Return a normalized page model with:
    - `pageNumber`
    - extracted text
    - char count
    - whitespace-normalized content
  - Define explicit native-text quality heuristics before OCR fallback, for example:
    - total extracted chars
    - average non-whitespace chars per page
    - percentage of pages with meaningful text
  - Edge cases to handle:
    - encrypted/corrupt PDF bytes
    - empty PDFs
    - PDFs with only whitespace text layers
    - mixed PDFs where some pages have native text and some require OCR
    - PDFs at or near the 10MB indexing limit
  - Keep extraction deterministic so tests can compare exact page outputs.
  - Acceptance criteria:
    - native-text PDFs that meet thresholds do not invoke OCR
    - extraction output is deterministic enough for snapshot-style unit tests

- [ ] **19.6 - Add pluggable OCR contracts and fallback behavior**
  - Files:
    - `secure-vault/src/lib/ai/ocr/types.ts`
    - `secure-vault/src/lib/ai/ocr/provider-registry.ts` (new)
    - `secure-vault/src/lib/ai/ocr/gemini-vision-ocr.ts`
    - `secure-vault/src/lib/ai/ocr/deepseek-ocr.ts` (new adapter seam or stub)
    - `secure-vault/src/lib/ai/ocr/glm-ocr.ts` (new adapter seam or stub)
    - `secure-vault/src/lib/ai/ocr/generic-ocr.ts`
    - `secure-vault/src/lib/ai/embeddings/pdf-page-renderer.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/pdf-ocr-strategy.ts` (new)
  - Define a provider interface such as:
    - `id`
    - provider `capabilities`
    - `extractPdfPages({ pdfBytes, pages })`
    - `extractRenderedPages({ pages: [{ pageNumber, imageBytes, mimeType }] })`
  - Default provider:
    - `GeminiVisionOcrProvider`
  - Additional provider seams:
    - `DeepSeekOcrProvider`
    - `GlmOcrProvider`
    - `GenericOcrProvider` as a swap-in adapter seam for future providers
  - Fallback rules:
    - use native extraction first
    - OCR only the pages that fail quality thresholds where feasible
    - route through `pdf-page-renderer.ts` when the configured provider accepts rendered images instead of raw PDFs
    - preserve page ordering when merging native + OCR text
  - Failure rules:
    - if OCR is configured but unavailable, mark the job `failed` with a stable reason code
    - never return partial silent success if page ordering or content association is ambiguous
  - Never log raw page text in server logs.
  - Acceptance criteria:
    - adding a new OCR provider only requires a new adapter plus registry entry
    - the processor does not contain vendor-specific OCR conditionals beyond capability checks

- [ ] **19.7 - Implement modality-aware chunking, embedding generation, and secure persistence**
  - Files:
    - `secure-vault/src/lib/ai/embeddings/chunker.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/embedder.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/embedding-processor.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/reference-text-crypto.ts` (new)
  - PDF chunking requirements:
    - split normalized extracted text into semantic chunks sized for retrieval quality, not raw pages only
    - keep page provenance on every chunk
    - include `page_from`, `page_to`, and `char_count`
  - Image requirements:
    - allow one or more embeddings per image without requiring extracted text
    - if no reference text exists, persist `null` encrypted text fields instead of inventing fake snippets
  - Embedding rules:
    - use `google.embedding(...)`
    - use `RETRIEVAL_DOCUMENT` for stored items
    - use the configured output dimensionality
    - verify returned vector length exactly matches schema expectations before DB insert
  - Persistence rules:
    - encrypt persisted reference text with a key derived from the file FEK and a fixed purpose string
    - replace stale prior chunks safely on re-index
    - write chunks plus final job status atomically where practical
  - Failure rules:
    - if extraction produces no usable content, mark `skipped` or `failed` with an explicit reason code instead of writing empty chunk sets
    - if embedding generation fails after old chunks were removed, do not leave the job falsely marked `ready`
  - Acceptance criteria:
    - re-indexing replaces prior chunks without leaving duplicate rows
    - image indexing works even when snippet text is intentionally `null`

- [ ] **19.8 - Harden the client trigger and upload-status UX**
  - Files:
    - `secure-vault/src/lib/upload/upload-job.ts`
    - `secure-vault/src/components/upload/upload-dialog.tsx`
    - `secure-vault/src/components/upload/upload-provider.tsx`
    - `secure-vault/src/hooks/use-upload-queue.ts`
  - Keep the browser-side trigger after upload completion, but make it truthful:
    - do not mark indexing as effectively complete just because `/api/embeddings` returned `2xx`
    - handle non-OK responses explicitly
    - map server job states into UI copy
  - Recommended behavior:
    - `POST /api/embeddings` sets local status to `pending`
    - poll `GET /api/embeddings/{fileId}` until terminal state for the active upload row
    - surface `queued`, `processing`, `ready`, `skipped`, and `failed` in a user-friendly way
  - Keep upload success separate from indexing status.
  - Preserve current cache invalidation for files/dashboard after upload success regardless of indexing outcome.
  - Ensure oversized PDFs and unsupported files still upload successfully and surface `skipped` cleanly.
  - Acceptance criteria:
    - `upload-job.ts` never marks semantic indexing complete on `POST /api/embeddings` acceptance alone
    - non-OK trigger responses and later processor failures are surfaced without regressing upload success

- [ ] **19.9 - Implement semantic retrieval service and search API**
  - Files:
    - `secure-vault/src/app/api/search/semantic/route.ts`
    - `secure-vault/src/lib/search/types.ts`
    - `secure-vault/src/lib/search/semantic/query-embedder.ts` (new)
    - `secure-vault/src/lib/search/semantic/semantic-search.ts` (new)
    - `secure-vault/src/lib/search/semantic/semantic-search-query.ts` (new)
    - `secure-vault/src/hooks/use-semantic-search-query.ts` (new)
  - Extend shared search types to include:
    - `SearchMode = 'filter' | 'filename' | 'semantic'`
    - semantic result DTOs with score and modality-aware references
  - `POST /api/search/semantic` responsibilities:
    - require auth
    - validate query text and limit
    - embed with `RETRIEVAL_QUERY`
    - run auth-scoped vector search joined to `files`
    - exclude soft-deleted, non-ready, failed, and skipped content
    - deduplicate multiple matching chunks from the same file to the best file-level result for v1 UI rendering
  - Result DTO should include enough UI data to render without a second fetch:
    - `fileId`
    - `name`
    - `mimeType`
    - `score`
    - `snippet` or null
    - `pageFrom`, `pageTo` when applicable
    - `folderId`
    - `folderPath`
  - Keep first-pass ranking simple and deterministic:
    - vector score descending
    - newest file as a secondary tiebreaker if needed
  - Do not silently fall back to filename search from the semantic endpoint.
  - Acceptance criteria:
    - the first page of semantic results does not contain duplicate cards for the same file
    - the route remains file-oriented even though retrieval is chunk-oriented underneath

- [ ] **19.10 - Integrate semantic mode into the existing files UI**
  - Files:
    - `secure-vault/src/components/files/toolbar.tsx`
    - `secure-vault/src/components/files/files-library.tsx`
    - `secure-vault/src/components/files/file-search-results.tsx`
    - `secure-vault/src/components/files/files-empty-state.tsx`
    - `secure-vault/src/components/files/files-library-header.tsx`
  - Add a third explicit search mode beside the existing `Filter` and `Filename` modes.
  - Important codebase-specific change:
    - `files-library.tsx` currently infers filename mode from a non-empty query. That needs to become explicit state before a second search mode is added.
  - Preserve current behavior:
    - `Filter` remains the default
    - `Filename` continues to work unchanged
    - `Semantic` is opt-in and only uses the new API
  - UI requirements:
    - dedicated helper text, loading state, empty state, and error state for semantic search
    - modality-aware result rendering
    - page references for PDFs
    - no misleading "Semantic indexing triggered" wording when indexing is still processing
  - State requirements:
    - switching into `Semantic` clears explorer-only transient state just like `Filename`
    - search results stay separate from the folder explorer surface
    - `Open folder` should continue to work from semantic results
  - Acceptance criteria:
    - `Filter` and `Filename` retain their current UX
    - semantic search results render with enough context to open the containing folder cleanly

- [ ] **19.11 - Add retries, observability, failure semantics, and cleanup rules**
  - Files:
    - `secure-vault/src/lib/ai/embeddings/error-codes.ts` (new)
    - `secure-vault/src/lib/ai/embeddings/logger.ts` (new or use existing logging conventions)
    - `secure-vault/src/app/api/cron/cleanup/route.ts` if cleanup/backfill hooks are needed
  - Define stable reason codes such as:
    - `UNSUPPORTED_MIME`
    - `PDF_TOO_LARGE`
    - `FILE_NOT_READY`
    - `FILE_DELETED`
    - `R2_READ_FAILED`
    - `DECRYPT_FAILED`
    - `PDF_PARSE_FAILED`
    - `PDF_RENDER_FAILED`
    - `OCR_PROVIDER_FAILED`
    - `OCR_PROVIDER_TIMEOUT`
    - `NO_SEARCHABLE_CONTENT`
    - `EMBEDDING_PROVIDER_FAILED`
    - `VECTOR_DIMENSION_MISMATCH`
    - `JOB_LEASE_EXPIRED`
  - Logging requirements:
    - log `jobId`, `fileId`, `userId`, modality, provider, attempt count, and reason code
    - never log extracted plaintext or full embeddings
  - Retry requirements:
    - safe manual re-trigger for `failed`
    - no duplicate chunk rows after retry
    - stale `processing` jobs need a recovery strategy if the request dies mid-flight
  - Cleanup requirements:
    - ensure permanent file deletion cascades to embedding rows
    - ensure semantic search excludes soft-deleted files immediately even before permanent deletion
  - Acceptance criteria:
    - stale jobs cannot remain `processing` forever without a recovery path
    - operators can debug failures from metadata alone without plaintext leakage

- [ ] **19.12 - Expose a clean retrieval seam for Phase 16**
  - Files:
    - `secure-vault/src/lib/search/semantic/index.ts` (new)
    - `secure-vault/src/lib/search/semantic/semantic-search.ts`
    - `tasks/phase-16-ai-agent.md` (reference alignment only if needed)
  - Export shared retrieval helpers from `src/lib/search/semantic/`.
  - Make the retrieval service reusable by the future AI agent without giving chat a second indexing path.
  - Keep auth scoping inside the shared retrieval service so later consumers cannot bypass it accidentally.

- [ ] **19.13 - Add rollout, backfill, and operational-readiness steps**
  - Files:
    - `tasks/phase-19-pdf-semantic-indexing.md`
    - `secure-vault/scripts/backfill-semantic-indexing.ts` (new, optional)
    - `secure-vault/scripts/check-semantic-health.ts` (new, optional)
  - Rollout plan:
    - default the feature behind `SEMANTIC_INDEXING_ENABLED`
    - validate migrations and provider config in staging before enabling for end users
    - enable new-upload indexing first
    - only run historical backfill after foreground flows are stable
  - Backfill requirements:
    - dry-run mode
    - bounded concurrency
    - idempotent enqueue behavior
    - backfill must not starve foreground upload-triggered jobs
  - Acceptance criteria:
    - production rollout does not require ad hoc SQL or manual route poking
    - the feature can be disabled instantly without affecting upload/download/search-by-filename behavior

---

## Cross-Cutting Edge Cases

These cases should be called out explicitly in implementation notes and tests rather than being treated as incidental:

- password-protected or corrupt PDFs
- whitespace-only or effectively empty PDFs
- mixed PDFs where only some pages need OCR
- OCR providers that accept raw PDFs vs rendered page images
- provider page-limit or batch-limit handling
- soft-delete during `queued` or `processing`
- stale `processing` jobs after process death
- duplicate `POST /api/embeddings` requests from multiple tabs
- embedding-provider dimension mismatches
- large libraries where multiple chunks from one file all score highly

---

## Deliverables

| Output | Location |
| --- | --- |
| Embeddings start route | `secure-vault/src/app/api/embeddings/route.ts` |
| Embeddings status route | `secure-vault/src/app/api/embeddings/[fileId]/route.ts` |
| Semantic search route | `secure-vault/src/app/api/search/semantic/route.ts` |
| Shared AI config/provider bootstrap | `secure-vault/src/lib/ai/config.ts`, `secure-vault/src/lib/ai/providers/google.ts` |
| OCR provider registry/adapters | `secure-vault/src/lib/ai/ocr/*.ts` |
| Embedding job orchestration | `secure-vault/src/lib/ai/embeddings/embedding-job-*.ts` |
| PDF extraction pipeline | `secure-vault/src/lib/ai/embeddings/pdf-*.ts` |
| Dispatcher boundary | `secure-vault/src/lib/ai/embeddings/{dispatcher,inline-dispatcher,queue-dispatcher}.ts` |
| Embedding processor/chunker | `secure-vault/src/lib/ai/embeddings/{chunker,embedder,embedding-processor}.ts` |
| Shared decrypted file reader | `secure-vault/src/lib/files/file-bytes.ts` or equivalent |
| Semantic retrieval service | `secure-vault/src/lib/search/semantic/*` |
| Semantic search hook/UI integration | `secure-vault/src/hooks/use-semantic-search-query.ts`, `secure-vault/src/components/files/*` |
| Upload status hardening | `secure-vault/src/lib/upload/upload-job.ts`, `secure-vault/src/components/upload/upload-dialog.tsx` |
| Forward-only migration | `secure-vault/drizzle/0009_semantic_indexing.sql` or equivalent next migration |

---

## Execution Order

1. Finalize config/constants, feature flags, execution mode, and eliminate modality-rule drift.
2. Reconcile schema plus forward-only migrations before writing runtime code.
3. Extract the shared decrypted-file reader from the existing download path.
4. Build job repository/service plus dispatcher boundary, then implement `POST /api/embeddings` and `GET /api/embeddings/{fileId}`.
5. Implement native PDF extraction and deterministic quality heuristics.
6. Implement OCR contracts, provider registry, and page-rendering support.
7. Implement chunking, embedding generation, secure reference-text persistence, and retry-safe replacement.
8. Add semantic search backend, hook, and file-level result deduplication.
9. Wire explicit semantic mode into the files UI.
10. Harden upload-trigger UX to reflect the real job lifecycle.
11. Add observability, stale-job recovery, cleanup verification, and rollout/backfill tooling.
12. Run targeted Vitest, Playwright, migration, and failure-injection suites, then fix regressions before closing the phase.

---

## Testing

### Automated Unit and Integration Tests (Vitest)

Run at minimum:

```bash
npx vitest run tests/upload tests/search tests/files tests/embeddings
```

Create or extend the following suites:

| Test file | Coverage |
| --- | --- |
| `secure-vault/tests/embeddings/config.test.ts` | env validation, execution-mode validation, dimension mismatch rejection, kill-switch behavior |
| `secure-vault/tests/embeddings/eligibility.test.ts` | supported MIME types, PDF size caps, drift prevention between client/server helpers |
| `secure-vault/tests/embeddings/file-bytes.test.ts` | FEK decryption, chunk ordering, missing chunk metadata, R2 read failures |
| `secure-vault/tests/embeddings/pdf-text-extractor.test.ts` | native text extraction, empty text layer handling, corrupt PDF behavior |
| `secure-vault/tests/embeddings/pdf-text-quality.test.ts` | OCR threshold heuristics, mixed native/scanned page classification |
| `secure-vault/tests/embeddings/pdf-page-renderer.test.ts` | rendered page output, page selection, render failures |
| `secure-vault/tests/embeddings/pdf-ocr-strategy.test.ts` | OCR fallback heuristics, mixed native/OCR pages, provider failures, capability selection |
| `secure-vault/tests/embeddings/ocr-provider-contract.test.ts` | common adapter contract for Gemini/DeepSeek/GLM-style providers |
| `secure-vault/tests/embeddings/chunker.test.ts` | semantic chunk boundaries, page-range propagation, empty-content handling |
| `secure-vault/tests/embeddings/reference-text-crypto.test.ts` | FEK-derived encryption round-trip, wrong-key failure, null-text behavior |
| `secure-vault/tests/embeddings/embedding-job-service.test.ts` | idempotent start, concurrent start requests, retry semantics, stale-job recovery, status transitions |
| `secure-vault/tests/embeddings/embeddings-route.test.ts` | `401`, `400`, `404`, `409`, `200`, and failure mapping for `/api/embeddings` |
| `secure-vault/tests/embeddings/embeddings-status-route.test.ts` | ownership scope, status payload shaping, failed/skipped reason codes |
| `secure-vault/tests/embeddings/embedding-processor.test.ts` | PDF success path, image success path, vector length validation, safe re-index replacement |
| `secure-vault/tests/search/semantic-search.test.ts` | query embedding contract, user scoping, deleted-file exclusion, ready-only results, ranking order, file-level dedupe |
| `secure-vault/tests/search/semantic-route.test.ts` | semantic route validation, auth failures, empty query, limit handling |
| `secure-vault/tests/files/files-library.test.tsx` | `Semantic` mode UI states, result rendering, `Open folder`, state reset, no regressions to `Filter`/`Filename` |
| `secure-vault/tests/upload/upload-job.test.ts` | existing client trigger tests updated to assert non-OK `/api/embeddings` handling and truthful status polling |
| `secure-vault/tests/upload/upload-provider.test.tsx` | upload queue reflects semantic status changes without regressing file/dashboard invalidation |
| `secure-vault/tests/scripts/backfill-semantic-indexing.test.ts` | dry-run mode, idempotent enqueue behavior, bounded concurrency if a backfill script lands |

Required assertions:

- A duplicate `POST /api/embeddings` for the same `fileId + modality` does not create duplicate jobs or duplicate chunk rows.
- Concurrent requests from two tabs cannot both transition the same job to `processing`.
- Oversized PDFs are skipped without affecting `files.status = 'ready'`.
- Unsupported files never create semantic jobs.
- Native-text PDFs do not call OCR.
- Scanned PDFs do call OCR when thresholds fail.
- Mixed PDFs preserve correct page provenance across native and OCR content.
- OCR providers that require rendered page images work through the page-renderer seam.
- Image indexing works without stored text snippets.
- Reference text is encrypted at rest and is never logged in plaintext.
- Semantic search never returns another user's files.
- Semantic search never returns soft-deleted or non-ready files.
- Semantic search deduplicates multiple matching chunks from the same file to one file-level result for the v1 UI.
- Semantic search rejects blank or too-short queries per the chosen API contract.
- Query embeddings use `RETRIEVAL_QUERY`; stored chunks use `RETRIEVAL_DOCUMENT`.
- The UI does not label a file as semantically ready merely because the trigger request succeeded.
- `Filter` and `Filename` modes keep their existing behavior.

### End-to-End Tests (Playwright)

Add or extend:

```bash
npx playwright test tests/e2e/storage-search.spec.ts tests/e2e/upload-smoke.spec.ts tests/e2e/file-access.spec.ts
```

Recommended scenarios:

1. Upload a PDF under 10MB and verify:
   - file becomes downloadable/previewable immediately
   - semantic status progresses independently afterward

2. Upload a scanned PDF and verify:
   - OCR fallback is used
   - page references remain correct in semantic results

3. Upload a PDF over 10MB and verify:
   - upload succeeds
   - semantic status shows `skipped`
   - file operations still work

4. Upload an eligible image and verify:
   - indexing starts
   - semantic search can later find it

5. Force an embedding-provider failure and verify:
   - upload stays successful
   - preview/download/share still work
   - semantic status shows a non-destructive failure

6. Use semantic search from the files page and verify:
   - results show score/snippet or modality-aware references
   - `Open folder` returns to the standard explorer cleanly

7. Soft-delete an indexed file and verify:
   - semantic search stops returning it immediately

8. Verify access control:
   - user A cannot retrieve semantic results for user B's indexed files

### Failure-Injection / Operational Verification

- Kill processing mid-job and verify stale-job recovery can re-queue safely.
- Force OCR timeout and verify the job ends in `failed` with a stable reason code and can be retried cleanly.
- Force vector-dimension mismatch and verify no corrupted rows are inserted.
- Run the forward-only migration against an existing local DB with data and verify compatibility.

### Manual Verification

1. Upload a native-text PDF and confirm it becomes searchable semantically without OCR.
2. Upload a scanned PDF and confirm OCR fallback is used.
3. Upload an AVIF image and confirm eligibility behavior matches the shared allowlist decision.
4. Re-trigger indexing for a previously failed file and confirm chunk rows are not duplicated.
5. Delete an indexed file to trash and confirm semantic search stops returning it immediately.
6. Permanently delete that file and confirm embedding rows are removed through cascade behavior.
7. Disable `SEMANTIC_INDEXING_ENABLED` and confirm uploads still succeed with semantic indexing cleanly skipped.

---

## Rollout Notes

- Default the feature to off until migrations, provider credentials, and staging verification are complete.
- Prefer enabling semantic indexing for new uploads first before any historical backfill.
- If the deployed runtime cannot guarantee background execution after an HTTP response, do not enable broad production rollout until the dispatcher is backed by a durable worker/queue.
- Track at minimum job success rate, failure rate by reason code, p95 processing time by modality, and semantic-search latency.

---

## Definition of Done

- Semantic indexing works end-to-end for supported PDFs and eligible images.
- Upload completion remains isolated from indexing success or failure.
- Job lifecycle is truthful, idempotent, concurrency-safe, and recoverable after stale processing.
- OCR is provider-pluggable through a capability-based abstraction rather than hardwired to one vendor.
- Extracted reference text is encrypted at rest.
- Semantic search is auth-scoped, production-safe, deduplicated to file-level UI results, and integrated into the existing files UI without regressing `Filter` or `Filename` modes.
- The upload queue reports real semantic job state instead of optimistic trigger acceptance.
- Production rollout is gated by feature flags and does not depend on ad hoc manual steps.
- Phase 16 can reuse the same semantic retrieval service without introducing a second indexing path.
