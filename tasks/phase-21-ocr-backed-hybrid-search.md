# Phase 21 - OCR-Backed Hybrid Retrieval with Encrypted Extracted Content

> **Objective:** Add a production-grade search stack that combines filename lexical search, lexical search over OCR-extracted document content, and the existing visual semantic retrieval, while ensuring extracted content is encrypted at rest and never persisted as plaintext in MariaDB or object storage.

**Depends on:** Phase 1 (DB), Phase 2 (Encryption), Phase 4 (Upload), Phase 5 (Download/Preview), Phase 14 (Storage & Search), Phase 19 (PDF Semantic Indexing), Phase 20 (Object Storage Abstraction)  
**Blueprint ref:** Sections 3 (Upload Flow), 8 (Schema), 14 (Search), 19 (Semantic Indexing), 20 (Storage Abstraction)

> [!IMPORTANT]
> This phase is not allowed to persist plaintext extracted content. OCR/native extracted content must be encrypted with application-managed keys before persistence, and lexical retrieval over extracted content must operate on derived blind indexes, not raw text columns.

---

## Current Implementation Snapshot

- [x] Filename lexical search already exists end-to-end through:
  - `secure-vault/src/lib/search/filename-search.ts`
  - `secure-vault/src/app/api/search/files/route.ts`
  - `secure-vault/src/hooks/use-filename-search-query.ts`
- [x] Visual semantic search already exists through:
  - `secure-vault/src/lib/search/semantic/semantic-search.ts`
  - `secure-vault/src/lib/search/semantic/hybrid-search.ts`
  - `secure-vault/src/app/api/search/semantic/route.ts`
- [x] Decrypted file-byte reconstruction already exists through:
  - `secure-vault/src/lib/files/file-bytes.ts`
- [x] The current search UI already renders result-level source context in:
  - `secure-vault/src/components/files/file-search-results.tsx`
- [x] `secure-vault/src/lib/db/schema/embedding-chunks.ts` already contains unused text-related columns:
  - `encrypted_text`
  - `text_iv`
  - `text_auth_tag`
- [ ] There is no OCR provider integration.
- [ ] There is no extracted-content job lifecycle.
- [ ] There is no encrypted extracted-content store used in retrieval.
- [ ] There is no blind-index search substrate for encrypted extracted text.
- [ ] The current hybrid search path merges only filename lexical + visual semantic and can surface unindexed filename-only hits.

> [!NOTE]
> This phase must preserve all current upload, preview, download, share-link, trash, and existing search behavior when OCR extraction is disabled, unavailable, empty, or partially failed.

---

## End Goal

Ship one production search mode with these retrieval signals:

- filename lexical search
- extracted-content lexical search from OCR text
- existing visual semantic search

The final retrieval system must:

- keep visual embeddings as the primary semantic signal
- use OCR text as a precision-support signal
- use filename lexical search as an exact metadata signal
- work on encrypted user-owned files only
- never persist plaintext OCR text
- return one result card per file
- expose why a result matched:
  - `Filename match`
  - `Text match`
  - `Visual match`
  - `Hybrid match`

This phase optimizes for:

- exact-term precision
- acronym and code-like query recall
- figure-aware retrieval retained from visual embeddings
- production-safe encrypted storage of extracted content

This phase is **not** the first-pass solution for:

- semantic search over extracted text embeddings
- exact highlighted snippets rendered from plaintext DB storage
- fuzzy wildcard substring search over encrypted extracted text
- query-time OCR

---

## Core Architecture Decisions

### 1. Keep visual embeddings as the primary semantic layer

Do not remove or downgrade the current visual embedding pipeline from Phase 19.

Use the existing:

- image embeddings
- PDF page/window/full embeddings
- visual-semantic candidate retrieval

This remains the system of record for:

- conceptual similarity
- diagram/figure-heavy pages
- non-textual PDF understanding

### 2. Add OCR extraction as a separate indexing pipeline

Do not couple OCR extraction lifecycle to visual embedding lifecycle.

Create a dedicated content-extraction job system so these concerns can fail, retry, and roll out independently.

Why:

- OCR and visual embedding have different failure modes
- OCR and visual embedding have different provider limits and retry semantics
- a file may have usable visual embeddings even if OCR fails
- a file may have usable OCR text even if visual indexing is skipped or delayed

### 3. Persist extracted content encrypted, not plaintext

The system must never store OCR text in plaintext in:

- MariaDB
- R2 / object storage
- logs
- analytics payloads

Persist extracted content encrypted with the file FEK lineage already used for file data.

### 4. Search encrypted extracted content through blind indexes

Because plaintext extracted text is forbidden at rest, DB lexical search must use derived blind indexes.

For v1 in this phase:

- store encrypted extracted text for recovery, debugging, re-chunking, and future highlighting
- store irreversible token hashes and token-position metadata for lexical retrieval

This phase must not rely on:

- MariaDB `FULLTEXT` over plaintext extracted text
- decrypting every chunk at query time
- external search engines containing plaintext extracted content

### 5. OCR extracted text is a support layer, not the semantic primary

Exact retrieval responsibilities:

- filename lexical:
  - file names
  - acronyms
  - identifiers
  - short exact queries
- extracted-content lexical:
  - exact terms inside documents
  - ordered multi-token queries
  - code words and technical vocabulary
- visual semantic:
  - concept-level similarity
  - figure-driven relevance
  - non-textual page meaning

### 6. Do not reuse `embedding_chunks.encrypted_text` in v1 of this phase

Although text-related columns already exist on `embedding_chunks`, this phase must use dedicated extracted-content tables instead of overloading visual embedding rows.

Reason:

- OCR text lifecycle and chunking differ from visual embedding lifecycle
- visual embedding windows and OCR lexical pages are not guaranteed to align
- retrying OCR must not rewrite visual embedding rows
- production debugging is clearer when extraction and embedding data are separated

---

## Target Data Model

### New table: `content_extraction_jobs`

Purpose:

- lifecycle tracking for OCR extraction per file

Columns:

```ts
id: varchar(21) primary key
file_id: varchar(21) not null references files.id
provider: enum("glm")
status: enum("queued", "processing", "ready", "skipped", "failed")
attempt_count: int not null default 0
processor_id: varchar(100) null
error_code: enum(
  "CONTENT_EXTRACTION_DISABLED",
  "CONTENT_EXTRACTION_UNAVAILABLE",
  "UNSUPPORTED_MIME",
  "FILE_TOO_LARGE",
  "FILE_NOT_READY",
  "FILE_DELETED",
  "DECRYPT_FAILED",
  "R2_READ_FAILED",
  "PDF_PARSE_FAILED",
  "OCR_PROVIDER_FAILED",
  "OCR_PROVIDER_TIMEOUT",
  "OCR_PAGE_MISMATCH",
  "OCR_RESULT_INVALID",
  "JOB_LEASE_EXPIRED"
) null
error_message: varchar(1024) null
page_count: int null
pages_processed: int not null default 0
pages_with_text: int not null default 0
started_at: timestamp null
completed_at: timestamp null
last_heartbeat_at: timestamp null
lease_expires_at: timestamp null
created_at: timestamp not null
updated_at: timestamp not null
```

Indexes:

- unique index on `file_id`
- index on `status, updated_at`

Rules:

- one logical extraction job per file
- retries and reindex reuse the same job row
- no duplicate rows per file

### New table: `content_chunks`

Purpose:

- encrypted extracted text storage at page/chunk granularity

Columns:

```ts
id: varchar(21) primary key
job_id: varchar(21) not null references content_extraction_jobs.id
file_id: varchar(21) not null references files.id
chunk_index: int not null
chunk_type: enum("image", "pdf_page")
page_from: int null
page_to: int null
char_count: int not null
token_count: int not null
text_source: enum("ocr")
encryption_version: smallint not null default 1
encrypted_text: longblob not null
text_iv: blob not null
text_auth_tag: blob not null
created_at: timestamp not null
updated_at: timestamp not null
```

Indexes:

- unique index on `job_id, chunk_index`
- index on `file_id`
- index on `file_id, page_from`

Rules:

- one OCR content chunk per image file
- one OCR content chunk per PDF page
- no window-level OCR chunking in v1 of this phase

### New table: `content_chunk_terms`

Purpose:

- blind-index term search over encrypted extracted content

Columns:

```ts
id: bigint auto_increment primary key
chunk_id: varchar(21) not null references content_chunks.id
file_id: varchar(21) not null references files.id
term_hash: binary(32) not null
position_index: int not null
term_length: smallint not null
page_from: int null
page_to: int null
created_at: timestamp not null
```

Indexes:

- index on `term_hash`
- composite index on `term_hash, file_id`
- composite index on `chunk_id, position_index`
- composite index on `file_id, term_hash`

Rules:

- `term_hash` is deterministic `HMAC-SHA256(SEARCH_INDEX_KEY, normalized_token)`
- hashes are irreversible
- positions are required for ordered phrase boosting
- do not store plaintext tokens

### Search type changes

Extend `secure-vault/src/lib/search/types.ts`:

```ts
type SearchMode = "filename" | "semantic";

type SemanticSearchSource = "filename" | "text" | "visual";

type SemanticSearchMatchType =
  | "filename"
  | "text"
  | "image"
  | "pdf_full"
  | "pdf_page"
  | "pdf_window";
```

Result DTO requirements:

- `retrievalSources: SemanticSearchSource[]`
- `matchType`
- `pageFrom` / `pageTo`
- `score`

---

## Security and Encryption Requirements

### Non-negotiable storage rules

- plaintext OCR text must never be written to MariaDB
- plaintext OCR text must never be written to object storage
- plaintext OCR text must never be included in route responses
- plaintext OCR text must never be logged

### Encryption rules

- decrypt file bytes using the existing FEK/UEK path from `secure-vault/src/lib/files/file-bytes.ts`
- encrypt extracted chunk text using the file FEK lineage before persistence
- use a fresh random IV per `content_chunks` row
- store the auth tag per `content_chunks` row
- use AES-GCM through the same crypto primitives already used by the file pipeline where possible

### Blind-index rules

- introduce `SEARCH_INDEX_KEY` as a required server-side secret
- derive `term_hash = HMAC-SHA256(SEARCH_INDEX_KEY, normalized_token)`
- `SEARCH_INDEX_KEY` must be independent of FEK/UEK material
- rotating `SEARCH_INDEX_KEY` invalidates lexical blind indexes and therefore requires a full reindex

### Decryption access rules

- only server-side owned-file codepaths may decrypt extracted text
- search routes must not decrypt extracted text to rank baseline lexical results
- decryption is allowed only for:
  - internal debugging tools gated to operators
  - future snippet/highlight generation for an authenticated owner
  - reindex/recovery workflows

---

## OCR Provider Contract

### Provider choice for v1 of this phase

Use one OCR provider in this phase:

- provider id: `glm`

Implement the provider behind a dedicated abstraction so the route and service layers do not depend on raw SDK syntax.

Files:

- `secure-vault/src/lib/ai/ocr/provider.ts`
- `secure-vault/src/lib/ai/ocr/glm.ts`
- `secure-vault/src/lib/ai/ocr/types.ts`

### OCR input strategy

For deterministic page ownership:

- PDF files must be split into single-page PDF payloads before OCR
- image files must be sent as one image payload

Do not send multi-page PDFs as one OCR request in v1 of this phase.

Reason:

- guarantees one extracted page result maps to one stored page chunk
- eliminates page-boundary ambiguity
- makes retries page-stable
- makes tests deterministic

### OCR output contract

Provider output must be normalized to:

```ts
type OcrChunkResult = {
  chunkIndex: number;
  chunkType: "image" | "pdf_page";
  pageFrom: number | null;
  pageTo: number | null;
  text: string;
};
```

Validation rules:

- `text` may be empty
- `pageFrom/pageTo` must match the requested page for PDFs
- OCR result with mismatched page identity is invalid and fails the job with `OCR_PAGE_MISMATCH`
- OCR result that cannot be normalized to a string fails with `OCR_RESULT_INVALID`

---

## Text Normalization and Blind Index Generation

### Normalization contract

Use one normalization function for both indexing and querying:

1. apply Unicode `NFKC`
2. lowercase
3. replace all whitespace runs with a single space
4. tokenize by Unicode letters/digits using the equivalent of `[\p{L}\p{N}]+`
5. keep tokens with length `2..64`
6. preserve numbers and alphanumeric identifiers
7. preserve acronyms after lowercasing

Examples:

- `ERD` -> `erd`
- `JWT-TOKEN` -> `jwt`, `token`
- `Invoice2025` -> `invoice2025`

### Token persistence contract

For each token occurrence in a chunk:

- compute `term_hash`
- store `position_index`
- store `term_length`

Do not:

- remove stopwords in v1
- stem or lemmatize in v1
- store plaintext token previews

### Query processing contract

At search time:

- normalize the query with the same function
- reject queries with fewer than `1` surviving token after normalization
- hash tokens with `SEARCH_INDEX_KEY`
- search `content_chunk_terms` by hashed tokens

---

## Route Contracts

### `POST /api/content-extraction`

Purpose:

- create or reuse a content-extraction job for a file

Request:

```ts
type StartContentExtractionRequest = {
  fileId: string;
  action?: "enqueue" | "retry" | "reindex";
};
```

Success:

```ts
type StartContentExtractionResponse = {
  accepted: boolean;
  attemptCount: number;
  errorCode: ContentExtractionErrorCode | null;
  fileId: string;
  jobId: string;
  pagesProcessed: number;
  pagesWithText: number;
  retryable: boolean;
  status: "queued" | "processing" | "ready" | "skipped" | "failed";
  updatedAt: string;
};
```

Status mapping:

- `202` accepted or reused
- `400` invalid payload
- `401` unauthenticated
- `404` file not found or not owned
- `409` invalid retry/reindex state transition

Rules:

- idempotent on duplicate `enqueue`
- retry allowed only for retryable `failed`
- reindex allowed only from `ready`, `failed`, or `skipped`
- reused responses must return the current job state, not a fake restarted state

### `GET /api/content-extraction/{fileId}`

Purpose:

- return extraction status for one file

Success:

```ts
type GetContentExtractionStatusResponse = {
  fileId: string;
  job: {
    attemptCount: number;
    completedAt: string | null;
    errorCode: ContentExtractionErrorCode | null;
    errorMessage: string | null;
    jobId: string;
    pageCount: number | null;
    pagesProcessed: number;
    pagesWithText: number;
    retryable: boolean;
    startedAt: string | null;
    status: "queued" | "processing" | "ready" | "skipped" | "failed";
    updatedAt: string;
  } | null;
};
```

### `POST /api/search/semantic`

This remains the primary search route for the files page.

It must become the hybrid route that merges:

- filename lexical
- extracted-content lexical
- visual semantic

Request:

```ts
type HybridSearchRequest = {
  query: string;
  limit?: number;
};
```

Success:

```ts
type HybridSearchResponse = {
  limit: number;
  query: string;
  results: Array<{
    canPreview: boolean;
    fileId: string;
    folderId: string | null;
    folderPath: Array<{ id: string; name: string }>;
    isInRoot: boolean;
    matchType: "filename" | "text" | "image" | "pdf_full" | "pdf_page" | "pdf_window";
    mimeType: string;
    name: string;
    pageFrom: number | null;
    pageTo: number | null;
    retrievalSources: Array<"filename" | "text" | "visual">;
    score: number;
    size: number;
    updatedAt: string;
  }>;
};
```

Rules:

- query trimmed length `2..500`
- limit `1..25`, default `10`
- if extracted content is unavailable for a file, filename and visual signals may still return it
- one result row per file
- deterministic ordering required

---

## Job State Machine

Use the same state semantics as visual indexing:

- `queued`
- `processing`
- `ready`
- `failed`
- `skipped`

Allowed transitions:

- `queued -> processing`
- `queued -> skipped`
- `processing -> ready`
- `processing -> failed`
- `failed -> queued` on retry

State ownership rules:

- only the claiming worker may finalize `processing -> ready` or `processing -> failed`
- routes may create/reuse jobs, but may not mark them ready directly

---

## Retrieval Strategy

### Signal 1 - Filename lexical

Reuse the existing filename lexical service unchanged:

- `secure-vault/src/lib/search/filename-search.ts`

Candidate scope:

- top `50` file-level candidates

### Signal 2 - Extracted-content lexical

New service:

- `secure-vault/src/lib/search/text-search.ts`

Behavior:

- normalize and hash query tokens
- query matching `content_chunk_terms`
- rank chunks by lexical evidence
- fold best chunk hits to one file result

Chunk ranking order:

1. distinct matched query term count desc
2. ordered phrase hit desc
3. total matched token occurrences desc
4. narrower page range desc
5. updatedAt desc
6. fileId asc

Phrase hit rule:

- only for multi-token queries
- phrase hit is true when query token hashes appear in consecutive `position_index` order within the same chunk

Candidate scope:

- top `100` chunk candidates before folding
- folded to top `50` file candidates

### Signal 3 - Visual semantic

Reuse:

- `secure-vault/src/lib/search/semantic/semantic-search.ts`

Candidate scope:

- keep the current semantic config path and score-gap/min-similarity filtering

### Fusion strategy

Use weighted reciprocal rank fusion:

```ts
fusedScore =
  filenameWeight / (rrfK + filenameRank) +
  textWeight / (rrfK + textRank) +
  visualWeight / (rrfK + visualRank);
```

Required defaults:

- `rrfK = 60`
- `filenameWeight = 1.15`
- `textWeight = 1.35`
- `visualWeight = 1.00`

Required tie-breaks:

1. higher `fusedScore`
2. more retrieval sources
3. visual semantic score desc when present
4. text lexical representative rank desc when present
5. updatedAt desc
6. fileId asc

### Result labeling rules

- only `filename` source -> `Filename match`
- only `text` source -> `Text match`
- only `visual` source -> visual match label from current semantic type
- two or more sources -> `Hybrid match`

---

## Implementation Blueprint

### 1. OCR provider and extraction pipeline

Files:

- `secure-vault/src/lib/ai/ocr/types.ts`
- `secure-vault/src/lib/ai/ocr/provider.ts`
- `secure-vault/src/lib/ai/ocr/glm.ts`
- `secure-vault/src/lib/ai/ocr/errors.ts`
- `secure-vault/src/lib/ai/ocr/pdf-page-splitter.ts`

Responsibilities:

- provider abstraction
- page-by-page PDF OCR
- image OCR
- timeout handling
- provider error normalization

### 2. Content extraction job orchestration

Files:

- `secure-vault/src/lib/ai/content-extraction/job-repository.ts`
- `secure-vault/src/lib/ai/content-extraction/job-service.ts`
- `secure-vault/src/lib/ai/content-extraction/dispatcher.ts`
- `secure-vault/src/lib/ai/content-extraction/worker.ts`
- `secure-vault/src/lib/ai/content-extraction/processor.ts`

Responsibilities:

- job creation/reuse
- lease/heartbeat
- retry handling
- per-page extraction progress
- encrypted persistence

### 3. Encrypted content persistence and blind indexing

Files:

- `secure-vault/src/lib/search/content-encryption.ts`
- `secure-vault/src/lib/search/content-normalizer.ts`
- `secure-vault/src/lib/search/content-blind-index.ts`
- `secure-vault/src/lib/search/content-persist.ts`

Responsibilities:

- encrypt OCR text
- tokenize and hash
- store `content_chunks`
- store `content_chunk_terms`

### 4. Search services

Files:

- `secure-vault/src/lib/search/text-search.ts`
- `secure-vault/src/lib/search/hybrid-file-search.ts`

Responsibilities:

- extracted-text lexical retrieval
- representative chunk folding
- hybrid merge of filename + text + visual

### 5. Routes and UI integration

Files:

- `secure-vault/src/app/api/content-extraction/route.ts`
- `secure-vault/src/app/api/content-extraction/[fileId]/route.ts`
- `secure-vault/src/app/api/search/semantic/route.ts`
- `secure-vault/src/hooks/use-semantic-search-query.ts`
- `secure-vault/src/components/files/file-search-results.tsx`
- `secure-vault/src/components/files/files-library.tsx`
- `secure-vault/src/lib/upload/upload-job.ts`
- `secure-vault/src/components/upload/upload-dialog.tsx`

Responsibilities:

- search response shaping
- upload-triggered extraction enqueue
- combined search labels
- truthful indexing lifecycle copy

---

## Configuration

Add to `secure-vault/src/lib/ai/config.ts` or a sibling search config module:

- `CONTENT_EXTRACTION_ENABLED`
- `CONTENT_EXTRACTION_PROVIDER`
- `GLM_API_KEY`
- `CONTENT_EXTRACTION_TIMEOUT_MS`
- `CONTENT_EXTRACTION_MAX_CONCURRENCY`
- `CONTENT_EXTRACTION_MAX_RETRY_ATTEMPTS`
- `CONTENT_EXTRACTION_RETRY_BACKOFF_MS`
- `OCR_BATCH_MAX_PAGES`
- `SEARCH_INDEX_KEY`
- `HYBRID_RRF_K`
- `HYBRID_FILENAME_WEIGHT`
- `HYBRID_TEXT_WEIGHT`
- `HYBRID_VISUAL_WEIGHT`

Validation rules:

- `CONTENT_EXTRACTION_PROVIDER` must be `glm`
- `GLM_API_KEY` required when extraction enabled
- `SEARCH_INDEX_KEY` required when extraction enabled
- `SEARCH_INDEX_KEY` must be at least 32 bytes after decoding/normalization
- `OCR_BATCH_MAX_PAGES` must be `1` in this phase because OCR is page-granular
- all retry/timeout config must be positive integers with explicit minimums

---

## Task Checklist

- [ ] **21.1 - Add forward-only migration for extracted-content storage and blind indexes**
  - Files:
    - `secure-vault/drizzle/0010_content_extraction.sql` (or next migration)
    - `secure-vault/src/lib/db/schema/content-extraction-jobs.ts`
    - `secure-vault/src/lib/db/schema/content-chunks.ts`
    - `secure-vault/src/lib/db/schema/content-chunk-terms.ts`
    - `secure-vault/src/lib/db/schema/index.ts`
  - Acceptance criteria:
    - one logical extraction job per file
    - encrypted text storage exists separately from visual embeddings
    - blind-index term rows are queryable by `term_hash`

- [ ] **21.2 - Implement OCR provider abstraction and page-granular extraction**
  - Files:
    - `secure-vault/src/lib/ai/ocr/*`
  - Acceptance criteria:
    - PDFs split to single-page OCR inputs
    - images handled as one OCR input
    - provider errors normalized
    - page identity deterministic

- [ ] **21.3 - Implement encrypted OCR text persistence**
  - Files:
    - `secure-vault/src/lib/search/content-encryption.ts`
    - `secure-vault/src/lib/search/content-persist.ts`
  - Acceptance criteria:
    - no plaintext text persisted
    - encrypted text decrypts correctly for owned files
    - reindex safely replaces prior chunk rows

- [ ] **21.4 - Implement blind-index tokenization and lexical retrieval**
  - Files:
    - `secure-vault/src/lib/search/content-normalizer.ts`
    - `secure-vault/src/lib/search/content-blind-index.ts`
    - `secure-vault/src/lib/search/text-search.ts`
  - Acceptance criteria:
    - deterministic normalization
    - deterministic term hashes
    - phrase-boost logic works from token positions
    - no plaintext search columns required

- [ ] **21.5 - Implement extraction job lifecycle and worker**
  - Files:
    - `secure-vault/src/lib/ai/content-extraction/*`
    - `secure-vault/scripts/content-extraction-worker.ts`
  - Acceptance criteria:
    - upload-triggered enqueue works
    - retry/reindex semantics mirror the visual job system
    - worker crash/restart is reclaimable via lease logic

- [ ] **21.6 - Replace current two-source hybrid search with three-source hybrid search**
  - Files:
    - `secure-vault/src/lib/search/hybrid-file-search.ts`
    - `secure-vault/src/app/api/search/semantic/route.ts`
    - `secure-vault/src/lib/search/types.ts`
  - Acceptance criteria:
    - filename lexical + text lexical + visual semantic all contribute
    - deterministic weighted RRF ordering
    - one file result per file

- [ ] **21.7 - Update files-page result labeling and upload status**
  - Files:
    - `secure-vault/src/components/files/file-search-results.tsx`
    - `secure-vault/src/components/files/files-library.tsx`
    - `secure-vault/src/components/upload/upload-dialog.tsx`
    - `secure-vault/src/lib/upload/upload-job.ts`
  - Acceptance criteria:
    - results clearly indicate `Filename match`, `Text match`, `Visual match`, or `Hybrid match`
    - UI handles missing extraction status gracefully
    - upload success remains decoupled from extraction success

---

## Deliverables

| Output | Location |
| --- | --- |
| OCR provider layer | `secure-vault/src/lib/ai/ocr/*` |
| Content extraction job system | `secure-vault/src/lib/ai/content-extraction/*` |
| Encrypted content storage schema | `secure-vault/src/lib/db/schema/content-*.ts` |
| Blind-index lexical search | `secure-vault/src/lib/search/text-search.ts` |
| Three-source hybrid retrieval | `secure-vault/src/lib/search/hybrid-file-search.ts` |
| Content extraction routes | `secure-vault/src/app/api/content-extraction/*` |
| Search route upgrade | `secure-vault/src/app/api/search/semantic/route.ts` |
| Worker entrypoint | `secure-vault/scripts/content-extraction-worker.ts` |
| Forward-only migration | `secure-vault/drizzle/0010_content_extraction.sql` or next migration |

---

## Execution Order

1. Add schema and config validation.
2. Implement OCR provider abstraction and page splitting.
3. Implement encrypted text persistence and blind-index generation.
4. Implement content extraction job repository/service.
5. Add worker entrypoint and queue/lease processing.
6. Add extraction start/status routes.
7. Implement extracted-text lexical retrieval.
8. Replace two-source hybrid search with three-source hybrid search.
9. Update files-page labels and upload status copy.
10. Add rollout tooling and reindex support.

---

## Testing

### Automated Tests (Vitest)

Run at minimum:

```bash
npx vitest run tests/search tests/embeddings tests/upload tests/ocr
```

Create or extend:

| Test file | Coverage |
| --- | --- |
| `secure-vault/tests/ocr/config.test.ts` | env validation, `SEARCH_INDEX_KEY` rules, provider selection |
| `secure-vault/tests/ocr/glm-provider.test.ts` | OCR response normalization, timeout mapping, invalid page response handling |
| `secure-vault/tests/ocr/pdf-page-splitter.test.ts` | single-page PDF slicing, page count correctness, invalid PDF handling |
| `secure-vault/tests/ocr/content-encryption.test.ts` | FEK-based text encryption/decryption, IV uniqueness, auth tag validation |
| `secure-vault/tests/ocr/content-normalizer.test.ts` | Unicode normalization, tokenization, acronym handling, number handling |
| `secure-vault/tests/ocr/content-blind-index.test.ts` | deterministic `term_hash`, query/token parity, position persistence |
| `secure-vault/tests/ocr/content-persist.test.ts` | encrypted chunk writes, blind-index writes, reindex replacement safety |
| `secure-vault/tests/ocr/content-job-service.test.ts` | idempotent enqueue, retry/reindex rules, stale-job recovery |
| `secure-vault/tests/ocr/content-processor.test.ts` | PDF page OCR, image OCR, empty text pages, page mismatch failures |
| `secure-vault/tests/ocr/content-routes.test.ts` | `401`, `400`, `404`, `409`, `202`, exact error payloads |
| `secure-vault/tests/search/text-search.test.ts` | exact token match, phrase boost, chunk folding, deleted-file exclusion |
| `secure-vault/tests/search/hybrid-file-search.test.ts` | filename/text/visual merge, weighted RRF ordering, deterministic ties |
| `secure-vault/tests/files/file-search-results.test.tsx` | new labels for filename/text/visual/hybrid plus backward compatibility |
| `secure-vault/tests/upload/upload-job.test.ts` | OCR extraction enqueue after upload, decoupled lifecycle copy |

### Required core-case assertions

- query `ERD` matches:
  - filename lexical when file name contains `ERD`
  - extracted-content lexical when OCR text contains `ERD`
  - hybrid boost when both match
- query `dog` can still rank a visually relevant file even when filename/text lexical miss
- query with exact text inside PDF body but not filename surfaces `Text match`
- query with both visual and OCR evidence surfaces `Hybrid match`

### Required edge-case assertions

- OCR returns empty text for a page:
  - job may still complete successfully
  - page produces zero `content_chunk_terms`
  - no plaintext empty-row anomaly
- OCR provider returns malformed page identity:
  - job fails with `OCR_PAGE_MISMATCH` or `OCR_RESULT_INVALID`
- duplicate enqueue does not create duplicate jobs or chunk rows
- retry after retryable failure reuses the same job id
- reindex safely replaces prior extracted content and blind-index rows
- soft-deleted files are excluded from text lexical search immediately
- files without OCR status still participate in filename + visual search
- files with OCR ready but visual indexing failed still participate in text lexical search
- searching does not require decrypting every stored content chunk
- plaintext OCR text never appears in DB fixtures, logs, or route payloads
- `SEARCH_INDEX_KEY` rotation forces explicit reindex requirement and does not silently corrupt results
- very large OCR output does not exceed configured token persistence guardrails
- one-character queries and all-whitespace queries are rejected
- legacy UI results missing the latest `retrievalSources` field do not crash the client

### End-to-End Tests (Playwright)

Recommended scenarios:

1. Upload a PDF with visible text and verify:
   - upload succeeds
   - extraction job becomes `ready`
   - query for an exact body term returns `Text match`

2. Upload a PDF with diagrams and exact text and verify:
   - query for concept returns visual/hybrid result
   - query for exact acronym returns text/filename/hybrid result as appropriate

3. Upload an image with OCR-detectable text and verify:
   - extraction job becomes `ready`
   - exact text query returns the file

4. Force OCR provider failure and verify:
   - upload remains successful
   - filename + visual search still operate
   - extraction status reports failure truthfully

5. Reindex after OCR provider recovery and verify:
   - old content rows replaced
   - duplicate lexical hits are not created

6. Soft-delete an indexed file and verify:
   - filename/text/visual search all stop returning it

---

## Rollout Notes

- ship behind `CONTENT_EXTRACTION_ENABLED`
- enable for new uploads first
- keep current filename + visual hybrid behavior as fallback while extraction backfill is incomplete
- add historical backfill only after OCR worker stability is proven
- track at minimum:
  - extraction success rate
  - pages with text vs pages processed
  - OCR latency per page
  - hybrid search latency
  - search source distribution: filename vs text vs visual vs hybrid

---

## Definition of Done

- OCR extraction runs for eligible image and PDF files through a dedicated worker lifecycle.
- Extracted content is stored encrypted and never as plaintext.
- Lexical retrieval over extracted content works through blind indexes without plaintext DB search.
- Search results merge filename lexical, text lexical, and visual semantic signals deterministically.
- The files page shows correct source labels and remains backward-compatible with legacy cached results.
- Upload success is never coupled to OCR extraction success.
- The feature is rollout-safe, retry-safe, and reindex-safe.

---

## One-Line Summary

> Keep visual embeddings as the primary semantic layer, add full OCR as an independent encrypted extraction pipeline, index extracted text through blind-index lexical search, and fuse filename lexical + text lexical + visual semantic into one deterministic production search path without ever storing plaintext extracted content.
