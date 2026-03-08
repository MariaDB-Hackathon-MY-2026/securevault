# Phase 4 — File Upload (Chunked + Streamed)

> **Objective:** Implement the full chunked upload pipeline: init → streaming chunk upload → complete, with server-side encryption streamed directly to R2 (never buffered in memory).

**Depends on:** Phase 1 (DB), Phase 2 (Encryption), Phase 3 (Auth)  
**Blueprint ref:** Sections 3 (Upload Flow — Streaming), 18 (Resumable Upload), 11 (MIME validation)

---

## Tasks

- [ ] **4.1 — Set up R2 client**
  - File: `src/lib/storage/r2.ts`
  - Initialize `@aws-sdk/client-s3` with R2 credentials
  - Helpers: `putObject(key, body)`, `putObjectStream(key, stream)`, `getObject(key)`, `deleteObject(key)`, `listObjects(prefix)`
  - The `putObjectStream` helper must accept a `ReadableStream` or Node `Readable` and pass it as the `Body` to `PutObjectCommand`
  - R2 endpoint format: `https://{accountId}.r2.cloudflarestorage.com`

- [ ] **4.2 — Implement upload init route**
  - File: `src/app/api/upload/init/route.ts`
  - POST: `{ fileName, fileSize, mimeType }`
  - Validate auth (getCurrentUser)
  - Sanitize `fileName` (strip `../`, hidden paths, and dangerous chars to prevent RCE)
  - Check quota: `user.storage_used + fileSize <= 1GB`
  - Check max file size: `fileSize <= 100MB`
  - **Concurrent upload dedup**: check for existing `upload_sessions` with same `user_id` + `file_name` + `file_size` in status `initialized`/`uploading` — if found, return existing `uploadId` instead of creating duplicate
  - Generate FEK, encrypt with UEK
  - Create `files` record (status: `uploading`)
  - Create `upload_sessions` record
  - Return: `{ uploadId, fileId, totalChunks }`

- [ ] **4.3 — Implement streaming chunk upload route**
  - File: `src/app/api/upload/chunk/route.ts`
  - POST: raw binary body (not FormData), chunk metadata in headers:
    - `x-upload-id`: upload session ID
    - `x-chunk-index`: chunk number (0-based)
  - Validate: auth, upload session exists, chunk not already uploaded
  - Server-side MIME detection with `file-type` (first chunk only — buffer first 4KB for detection, then stream the rest)
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

- [ ] **4.4 — Implement upload complete route**
  - File: `src/app/api/upload/complete/route.ts`
  - POST: `{ uploadId }`
  - Verify all chunks received
  - Update file status to `ready`
  - Update `user.storage_used += file.size`
  - Update upload session status to `ready`
  - Return: `{ fileId, status: "ready" }`

- [ ] **4.5 — Implement client-side chunker**
  - File: `src/lib/storage/chunker.ts`
  - `sliceFile(file: File, chunkSize: number): Blob[]` — splits into 5MB chunks
  - Chunk size constant: `CHUNK_SIZE = 5 * 1024 * 1024`

- [ ] **4.6 — Implement `useUpload` hook**
  - File: `src/hooks/use-upload.ts`
  - Manages upload lifecycle: init → chunk loop → complete
  - **Send chunks as raw binary** via `fetch()` with `body: blob` (not FormData) — this allows the Vercel Route Handler to access `req.body` as a stream
  - Pass chunk metadata in request headers (`x-upload-id`, `x-chunk-index`)
  - Progress tracking (0-100%)
  - Retry logic: up to 3 retries per chunk
  - Resume support: check for existing incomplete upload
  - Pause/cancel support
  - **Dynamic Chunk Concurrency**: Use a global limit queue (e.g., `p-queue` with `concurrency: 3`) to manage the uploading of _every_ chunk across _all_ files. This creates a global pool of active network requests, maximizing speed for large files while preventing self-DDoS when dropping dozens of small files.
  - **Adaptive backoff**: If server returns 429 (rate limit), back off before retrying

- [ ] **4.7 — Build upload dialog UI**
  - File: `src/components/upload/upload-dialog.tsx`
  - Drag-and-drop zone (react-dropzone or native DnD API)
  - File selection via button
  - Progress bar per file
  - Multi-file queue support
  - Cancel button per file
  - Show file name, size, progress percentage

- [ ] **4.8 — Implement MIME type validation**
  - In chunk route (first chunk): buffer only the first 4KB for `file-type` detection, then resume streaming the rest
  - Ignore client-provided Content-Type
  - Store detected MIME in `files.mime_type`

---

## Deliverables

| Output              | Location                                  |
| ------------------- | ----------------------------------------- |
| R2 client           | `src/lib/storage/r2.ts`                   |
| Upload init API     | `src/app/api/upload/init/route.ts`        |
| Chunk upload API    | `src/app/api/upload/chunk/route.ts`       |
| Upload complete API | `src/app/api/upload/complete/route.ts`    |
| Client chunker      | `src/lib/storage/chunker.ts`              |
| Upload hook         | `src/hooks/use-upload.ts`                 |
| Upload dialog       | `src/components/upload/upload-dialog.tsx` |

---

## Testing

### Automated (Vitest) — `tests/upload/`

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

### Manual Verification (Browser)

1. Log in → click Upload → select a small file (< 5MB) → verify it uploads and appears in file list
2. Upload a file ~15MB → verify progress bar shows 3 chunks uploading
3. Attempt to upload a file > 100MB → verify rejection error shown
4. Check R2 bucket → verify encrypted chunks exist at `/{userId}/files/{fileId}/chunk_*`
5. Check MariaDB → verify `files` record has status `ready`, `file_chunks` records have `iv` + `auth_tag`
6. Upload while monitoring server memory → verify no spike to ~10MB per chunk (streaming confirmation)
