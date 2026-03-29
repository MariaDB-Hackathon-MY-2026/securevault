# Phase 4 - File Upload (Chunked + Streamed)

> **Objective:** Implement the full chunked upload pipeline: init -> streaming chunk upload -> complete, with server-side encryption streamed directly to R2 (never buffered in memory).

**Depends on:** Phase 1 (DB), Phase 2 (Encryption), Phase 3 (Auth)  
**Blueprint ref:** Sections 3 (Upload Flow - Streaming), 18 (Resumable Upload), 11 (MIME validation)

---

## Tasks

- [ ] **4.1 - Set up R2 client**
  - File: `src/lib/storage/r2.ts`
  - Initialize `@aws-sdk/client-s3` with R2 credentials
  - Helpers: `putObject(key, body)`, `putObjectStream(key, stream)`, `getObject(key)`, `deleteObject(key)`, `listObjects(prefix)`
  - The `putObjectStream` helper must accept a `ReadableStream` or Node `Readable` and pass it as the `Body` to `PutObjectCommand`
  - R2 endpoint format: `https://{accountId}.r2.cloudflarestorage.com`

- [ ] **4.2 - Implement upload init route**
  - File: `src/app/api/upload/init/route.ts`
  - POST: `{ fileName, fileSize, mimeType }`
  - Validate auth (getCurrentUser)
  - Sanitize `fileName` (strip `../`, hidden paths, and dangerous chars to prevent RCE)
  - Check quota: `user.storage_used + fileSize <= 1GB`
  - Check max file size: `fileSize <= 100MB`
  - **Concurrent upload dedup**: check for existing `upload_sessions` with same `user_id` + `file_name` + `file_size` in status `initialized`/`uploading` - if found, return existing `uploadId` instead of creating duplicate
  - Generate FEK, encrypt with UEK
  - Create `files` record (status: `uploading`)
  - Create `upload_sessions` record
  - Return: `{ uploadId, fileId, totalChunks }`

- [ ] **4.3 - Implement streaming chunk upload route**
  - File: `src/app/api/upload/chunk/route.ts`
  - POST: raw binary body (not FormData), chunk metadata in headers:
    - `x-upload-id`: upload session ID
    - `x-chunk-index`: chunk number (0-based)
  - Validate: auth, upload session exists, chunk not already uploaded
  - Server-side MIME detection with `file-type` (first chunk only - buffer first 4KB for detection, then stream the rest)
  - **Streaming encryption flow** (never buffer entire chunk):
    1. Create AES-256-GCM cipher with fresh 12-byte IV
    2. Read from `req.body` stream via `getReader()`
    3. Pipe each fragment through `cipher.update()` into a new `ReadableStream`
    4. On stream end, call `cipher.final()` and close
    5. Pass the encrypted `ReadableStream` to R2 `PutObjectCommand` via `Readable.fromWeb()`
  - After R2 upload completes, store `iv` + `cipher.getAuthTag()` in `file_chunks` table
  - Update `upload_sessions.completed_chunks`
  - Return: `{ chunkIndex, status: "uploaded" }`
  - **Memory target:** ~64KB buffered at any time (vs ~10MB if fully buffered)
  - **Body parser**: Disable Next.js body parsing in this route to enable raw stream access (`export const runtime = 'nodejs';`, access `req.body` as ReadableStream)

- [ ] **4.4 - Implement upload complete route**
  - File: `src/app/api/upload/complete/route.ts`
  - POST: `{ uploadId }`
  - Verify all chunks received
  - Update file status to `ready`
  - Update `user.storage_used += file.size`
  - Update upload session status to `ready`
  - Return: `{ fileId, status: "ready" }`
  - Do **not** run PDF embedding inside this route; upload success must stay independent from semantic indexing

- [ ] **4.5 - Implement client-side chunker**
  - File: `src/lib/storage/chunker.ts`
  - `sliceFile(file: File, chunkSize: number): Blob[]` - splits into 5MB chunks
  - Chunk size constant: `CHUNK_SIZE = 5 * 1024 * 1024`

- [ ] **4.6 - Implement OOP upload engine: `UploadJob` + `UploadManager`**
  - Files:
    - `src/lib/upload/upload-job.ts`
    - `src/lib/upload/upload-manager.ts`
  - Replace the per-file `useUpload` mental model with an **object-oriented upload system**
  - Each file upload should be represented by an `UploadJob` object responsible for its own lifecycle, state, and upload logic
  - Global concurrency and orchestration should be owned by an `UploadManager`
  - Implement an `UploadJob` class that at minimum owns:
    - `id`
    - `file`
    - `status`
    - `progress`
    - `uploadId`
    - `fileId`
    - `completedChunkIndexes`
    - `error`
  - Implement `UploadJob` methods such as:
    - `start()`
    - `pause()`
    - `resume()`
    - `cancel()`
    - `getSnapshot()`
  - The `UploadJob` worker flow should still be: init -> status lookup -> chunk loop -> complete
  - **Send chunks as raw binary** via `fetch()` with `body: blob` (not FormData) - this allows the Vercel Route Handler to access `req.body` as a stream
  - Pass chunk metadata in request headers (`x-upload-id`, `x-chunk-index`)
  - Progress tracking (0-100%) can remain chunk-based
  - Retry logic: up to 3 retries per chunk
  - Resume support: after init returns an existing `uploadId`, call the status route and skip already uploaded chunk indexes
  - Pause/cancel support:
    - `pause` should stop after the current chunk and remain resumable
    - `cancel` should stop after the current chunk and move the client job into a cancelled/failed terminal state
  - Treat `409 Chunk already uploaded` as success for resumable uploads
  - **Adaptive backoff**: If server returns `429` (rate limit), back off before retrying
  - Implement an `UploadManager` class that:
    - stores all `UploadJob` instances
    - exposes actions such as `addFiles(files)`, `pauseUpload(id)`, `resumeUpload(id)`, `cancelUpload(id)`
    - provides `subscribe()` / `getSnapshot()` for React integration
    - runs a scheduler/pump function to start jobs when capacity is available
  - **File-level concurrency only**: at most `3` `UploadJob` instances uploading at the same time globally
  - **Per-file chunk concurrency**: `1` chunk at a time per file
  - `UploadJob` should own single-file behavior; `UploadManager` should own multi-file scheduling

- [ ] **4.6.1 - Expose upload manager to React via provider + hook**
  - Files:
    - `src/components/upload/upload-provider.tsx`
    - `src/hooks/use-upload-queue.ts`
  - React components should consume manager state through context instead of each upload card running its own upload loop
  - Use the singleton upload manager from `UploadManager.getInstance()` as the app-wide queue source
  - `UploadQueueProvider` should subscribe to the manager and keep React in sync with the latest manager snapshot
  - `useUploadQueue()` should expose:
    - `uploads`
    - `addFiles(files)`
    - `pauseUpload(id)`
    - `resumeUpload(id)`
    - `cancelUpload(id)`
    - `removeUpload(id)`
  - Ensure every consumer under the provider sees the same shared queue state
  - Add React-level tests that prove:
    - two upload cards/components share the same queue state
    - actions dispatched from one component are reflected in the others
    - provider unsubscribes cleanly on unmount

- [ ] **4.7 - Build upload dialog UI**
  - File: `src/components/upload/upload-dialog.tsx`
  - Drag-and-drop zone (react-dropzone or native DnD API)
  - File selection via button
  - Progress bar per file
  - Multi-file queue support
  - Cancel button per file
  - Show file name, size, progress percentage

- [ ] **4.8 - Implement MIME type validation**
  - In chunk route (first chunk): buffer only the first 4KB for `file-type` detection, then resume streaming the rest
  - Ignore client-provided Content-Type
  - Store detected MIME in `files.mime_type`

- [ ] **4.9 - Trigger semantic indexing from the client after upload completes**
  - In the upload worker inside `src/lib/upload/upload-job.ts`, after `/api/upload/complete` resolves, branch by uploaded file modality
  - If `mime_type === 'application/pdf'` and `size <= 10MB`, call `POST /api/embeddings` with `{ fileId, modality: 'pdf' }`
  - If the file is an eligible image, call `POST /api/embeddings` with `{ fileId, modality: 'image' }`
  - Treat indexing as best-effort and failure-isolated: show status, but never roll back the ready upload
  - Skip the trigger entirely for non-PDF files and PDFs larger than 10MB

---

## Deliverables

| Output              | Location                                  |
| ------------------- | ----------------------------------------- |
| R2 client           | `src/lib/storage/r2.ts`                   |
| Upload init API     | `src/app/api/upload/init/route.ts`        |
| Chunk upload API    | `src/app/api/upload/chunk/route.ts`       |
| Upload complete API | `src/app/api/upload/complete/route.ts`    |
| Client chunker      | `src/lib/storage/chunker.ts`              |
| Upload job          | `src/lib/upload/upload-job.ts`            |
| Upload manager      | `src/lib/upload/upload-manager.ts`        |
| Upload provider     | `src/components/upload/upload-provider.tsx` |
| Upload queue hook   | `src/hooks/use-upload-queue.ts`           |
| Upload dialog       | `src/components/upload/upload-dialog.tsx` |
| Embedding trigger   | `src/lib/upload/upload-job.ts`            |

---

## Testing

### Automated (Vitest) - `tests/upload/`

```bash
npx vitest run tests/upload
```

| Test                                   | Expected                                        |
| -------------------------------------- | ----------------------------------------------- |
| Chunker splits 12MB file into 3 chunks | 3 chunks, last < 5MB                            |
| Chunker splits 5MB file into 1 chunk   | Exactly 1 chunk                                 |
| Quota check rejects when over limit    | Returns 413                                     |
| File > 100MB rejected                  | Returns 413                                     |
| Upload init creates DB records         | Records exist with status `uploading`           |
| Chunk route stores IV + authTag in DB  | `file_chunks` row has non-null `iv`, `auth_tag` |
| Chunk route does not buffer full chunk | Validate streaming (mock R2 `Body` is a stream) |
| Queue starts at most 3 files globally  | 4th queued file waits until a slot frees up      |
| Pause stops after current chunk        | Job transitions to `paused` without corruption   |
| Resume skips uploaded chunks           | Status route drives resumption correctly         |
| Cancel stops after current chunk       | Job transitions to `cancelled`/`failed` safely   |
| Two upload cards share same queue      | Actions/state stay consistent across components  |
| Eligible PDF triggers indexing request   | `POST /api/embeddings` called after ready       |
| Eligible image triggers indexing request | `POST /api/embeddings` called after ready       |
| Ineligible file skips indexing trigger   | Upload still succeeds with no embedding request |

### Manual Verification (Browser)

1. Log in -> click Upload -> select a small file (< 5MB) -> verify it uploads and appears in file list
2. Upload a file ~15MB -> verify progress bar shows 3 chunks uploading
3. Attempt to upload a file > 100MB -> verify rejection error shown
4. Check R2 bucket -> verify encrypted chunks exist at `/{userId}/files/{fileId}/chunk_*`
5. Check MariaDB -> verify `files` record has status `ready`, `file_chunks` records have `iv` + `auth_tag`
6. Upload a PDF under 10MB or an eligible image -> verify the client starts the embedding job only after upload completes
7. Upload while monitoring server memory -> verify no spike to ~10MB per chunk (streaming confirmation)
