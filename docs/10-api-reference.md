# SecureVault API Reference

This reference covers the HTTP route handlers currently implemented in `secure-vault/src/app/api`.

## API Conventions

### Authentication

- Most authenticated routes rely on the `__Secure-session` cookie.
- Shared-link routes use a token in the URL and may additionally require a share access session created after OTP verification.
- Cron routes require `Authorization: Bearer {CRON_SECRET}`.

### Response Style

- Successful responses are JSON unless the route streams a file.
- Download and preview endpoints stream decrypted file content.
- Error responses typically return `{ message: string }` or `{ error: string }`.
- Some semantic endpoints use structured route error payloads with machine-readable codes.

### Product Limits And Supported Types

| Contract | Current value |
| --- | --- |
| Upload chunk size | 5 MiB |
| Max upload size | 100 MiB |
| Max active uploads per user | 3 |
| Default storage quota | 1 GiB |
| Trash retention | 30 days |
| Uploadable image types | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif` |
| Uploadable document types | `application/pdf` |
| Max PDF size for semantic indexing | 10 MiB |

### Encryption Model

- File encryption is server-managed.
- The application encrypts chunks before storing them in R2 and decrypts them on authorized reads.
- This is not a client-side or end-to-end encryption contract.

### Rate Limiting

Implemented with Redis-backed fixed windows, failing open outside production if Redis is unavailable.

| Policy | Limit | Window |
| --- | --- | --- |
| Login | 5 | 15 minutes |
| Signup | 5 | 1 hour |
| Share OTP request | 3 | 15 minutes |
| Share OTP verify | 3 | 5 minutes |
| Password reset request | 3 | 15 minutes |
| Password reset verify | 5 | 5 minutes |
| Upload | 100 | 1 minute |
| Download | 30 | 1 minute |

## Auth Routes

### `GET /api/auth/current-user`

- Auth required: yes
- Purpose: return the current authenticated user in client-safe form
- Success response:
  - `200` with `{ user }`
- Common failures:
  - `401` unauthorized

### `POST /api/auth/password-reset/request-otp`

- Auth required: no
- Purpose: request a password reset OTP for an email address
- Request body:
  - `email`
- Behavior:
  - validates email presence
  - rate-limits by IP and IP+email
  - returns a generic success response even when the email does not exist
- Success response:
  - `200` with a generic success message
- Common failures:
  - `400` validation error
  - `429` rate-limited

### `POST /api/auth/password-reset/reset`

- Auth required: no
- Purpose: reset a password with email, OTP code, and new password
- Request body:
  - `email`
  - `code`
  - `newPassword`
- Behavior:
  - validates password strength
  - verifies OTP
  - updates password
  - deletes all active sessions for the user
- Success response:
  - `200` with success message
- Common failures:
  - `400` validation error
  - `403` invalid, expired, used, or locked OTP
  - `429` rate-limited
  - `500` reset failure

## File Metadata Routes

### `GET /api/files`

- Auth required: yes
- Purpose: list ready, non-deleted files for the current user
- Success response:
  - `200` with `{ files }`
- Common failures:
  - `401` invalid credentials
  - `500` load failure

### `GET /api/files/explorer`

- Auth required: yes
- Purpose: load the explorer dataset used by the Files page
- Success response:
  - `200` with `{ files, folders }`
- Common failures:
  - `401` invalid credentials
  - `500` load failure

### `GET /api/files/storage-dashboard`

- Auth required: yes
- Purpose: load storage analytics and quota information
- Success response:
  - `200` with dashboard data including quota, active bytes, trash bytes, category breakdown, and largest files
- Common failures:
  - `401` invalid credentials
  - `500` load failure

### `GET /api/files/trash`

- Auth required: yes
- Purpose: load root trash items plus summary information
- Success response:
  - `200` with trash page data
- Common failures:
  - `401` invalid credentials
  - `500` load failure

### `GET /api/files/trash/summary`

- Auth required: yes
- Purpose: load lightweight trash counters
- Success response:
  - `200` with trash summary
- Common failures:
  - `401` invalid credentials
  - `500` load failure

## File Streaming Routes

### `GET /api/files/:id/download`

- Auth required: yes
- Purpose: stream an owned file as an attachment
- Behavior:
  - verifies ownership
  - rate-limits download traffic
  - decrypts and streams the file
- Success response:
  - `200` streamed file response
- Common failures:
  - `401` invalid credentials
  - `404` file not found
  - `429` rate-limited
  - `500` stream failure

### `GET /api/files/:id/preview`

- Auth required: yes
- Purpose: stream an owned file inline for preview
- Behavior:
  - same security path as download
  - uses inline disposition
- Success response:
  - `200` streamed file response
- Common failures:
  - same as download

## Upload Routes

### `POST /api/upload/init`

- Auth required: yes
- Purpose: initialize a resumable upload session
- Request body:
  - `fileName`
  - `fileSize`
  - `fileType`
- Behavior:
  - validates body
  - checks quota and file size
  - creates file metadata and upload session records
- Success response:
  - `200` with `{ fileId, uploadId, totalChunks }`
- Common failures:
  - `401` invalid credentials
  - `400` invalid request
  - `413` or `4xx` upload initialization constraint failures
  - `429` rate-limited
  - `500` initialization failure

Example request:

```json
{
  "fileName": "quarterly-report.pdf",
  "fileSize": 7340032,
  "fileType": "application/pdf"
}
```

Example success response:

```json
{
  "fileId": "file_123",
  "uploadId": "upload_123",
  "totalChunks": 2
}
```

### `GET /api/upload/status?uploadId=...`

- Auth required: yes
- Purpose: fetch resumable upload state
- Query parameters:
  - `uploadId`
- Success response:
  - `200` with upload status, completed chunk indexes, `fileId`, `uploadId`, and `totalChunks`
- Common failures:
  - `401` invalid credentials
  - `400` invalid query
  - `404` upload not found
  - `429` rate-limited
  - `500` lookup failure

### `POST /api/upload/start`

- Auth required: yes
- Purpose: claim an upload concurrency slot before uploading chunks
- Request body:
  - `uploadId`
- Success response:
  - `200` with `{ uploadId, activeCount, maxActiveUploads }`
- Common failures:
  - `401` invalid credentials
  - `404` unknown or unauthorized upload session
  - `429` no slot available, includes `Retry-After`
  - `500` claim failure

### `POST /api/upload/chunk`

- Auth required: yes
- Purpose: upload one chunk body for an active upload session
- Required headers:
  - `x-upload-id`
  - `x-chunk-index`
- Request body:
  - raw chunk bytes
- Behavior:
  - encrypts the chunk
  - writes encrypted data to R2
  - writes IV, auth tag, and R2 key metadata to `file_chunks`
- Success response:
  - `200` with chunk result payload
  - `409` may indicate the chunk already exists and can be treated as completed by the client
- Common failures:
  - `401` invalid credentials
  - `400` invalid headers or body
  - `429` rate-limited or lease conflict
  - `500` upload failure

Request contract summary:

- send raw bytes as the body
- set `x-upload-id` to the upload session ID
- set `x-chunk-index` to the zero-based chunk index

### `POST /api/upload/complete`

- Auth required: yes
- Purpose: finalize a resumable upload after all chunks are present
- Request body:
  - `uploadId`
- Behavior:
  - validates upload state
  - marks the file ready
  - releases the upload slot in a `finally` block
- Success response:
  - `200` with completion payload
- Common failures:
  - `400` invalid request
  - `403` invalid credentials
  - `4xx` transaction validation failures
  - `500` internal server error

Example request:

```json
{
  "uploadId": "upload_123"
}
```

### `POST /api/upload/release`

- Auth required: yes
- Purpose: manually release a claimed upload slot
- Request body:
  - `uploadId`
- Success response:
  - `200` with `{ released: true, uploadId }`
- Common failures:
  - `401` invalid credentials
  - `400` invalid request
  - `404` unknown upload session
  - `500` release failure

## Search Routes

### `GET /api/search/files?q=...&limit=...`

- Auth required: yes
- Purpose: exact or prefix-style filename search scoped to the current user
- Query parameters:
  - `q`
  - `limit` optional, default `20`
- Success response:
  - `200` with `{ query, results }`
- Common failures:
  - `400` missing or too-short query
  - `401` invalid credentials
  - `500` search failure

### `POST /api/search/semantic`

- Auth required: yes
- Purpose: run semantic or hybrid search over indexed content
- Request body:
  - `query`
  - `limit` optional, max `25`
- Behavior:
  - requires semantic indexing to be enabled
  - embeds the query
  - combines semantic ranking with scoped metadata retrieval
- Success response:
  - `200` with `{ query, limit, results }`
- Common failures:
  - `400` invalid request
  - `401` unauthenticated
  - `503` semantic indexing disabled or unavailable

Example request:

```json
{
  "query": "invoice signed in March",
  "limit": 10
}
```

## Embeddings Routes

### `POST /api/embeddings`

- Auth required: yes
- Purpose: create, retry, or reindex a semantic indexing job for a file
- Request body:
  - `fileId`
  - `modality` as `pdf` or `image`
  - `action` optional: `enqueue`, `retry`, or `reindex`
- Success response:
  - `202` with job state payload
- Common failures:
  - `400` invalid request
  - `401` unauthenticated
  - `404` file or job target not found
  - `409` job conflict
  - `503` semantic indexing unavailable

Example request:

```json
{
  "fileId": "file_123",
  "modality": "pdf",
  "action": "enqueue"
}
```

### `GET /api/embeddings/:fileId`

- Auth required: yes
- Purpose: fetch semantic indexing status for the current user’s file
- Success response:
  - `200` with a list of jobs and their statuses
- Common failures:
  - `401` unauthenticated
  - `404` not found
  - `503` status unavailable

## Share Routes

### `GET /api/share/links?fileId=...` or `GET /api/share/links?folderId=...`

- Auth required: yes and email-verified
- Purpose: list active share links owned by the current user for a single file or folder
- Query parameters:
  - either `fileId` or `folderId`
- Success response:
  - `200` with share link list
- Common failures:
  - `400` invalid target query
  - `401` unauthorized
  - `500` load failure

### `GET /api/share/:token/folder?folderId=...`

- Auth required: token-based, plus share access session for restricted links
- Purpose: browse a shared folder and optionally descend into a child folder
- Query parameters:
  - `folderId` optional, defaults to the share root folder
- Success response:
  - `200` with breadcrumb, current folder, child files, and child folders
- Common failures:
  - `403` access denied
  - `404` link not found
  - `410` expired link
  - `500` load failure

### `POST /api/share/:token/request-otp`

- Auth required: no normal session required
- Purpose: request a share-access OTP for a restricted share link
- Request body:
  - `email`
- Behavior:
  - returns generic success when an email is not allowed to avoid disclosing allowlist membership
- Success response:
  - `200` with generic success
- Common failures:
  - `400` email required
  - `429` rate-limited
  - `500` request failure

Example request:

```json
{
  "email": "reviewer@example.com"
}
```

### `POST /api/share/:token/verify-otp`

- Auth required: no normal session required
- Purpose: verify share-access OTP and create a share access session
- Request body:
  - `email`
  - `code`
- Success response:
  - `200` with `{ success: true }`
- Common failures:
  - `400` missing email or code
  - `403` invalid OTP or access denied
  - `429` rate-limited
  - `500` verification failure

Example request:

```json
{
  "email": "reviewer@example.com",
  "code": "123456"
}
```

### `POST /api/share/:token/logout`

- Auth required: token must reference a valid share link
- Purpose: clear the share access session associated with the link
- Success response:
  - `200` with `{ success: true }`
- Common failures:
  - `404` share link not found
  - `500` logout failure

### `GET /api/share/:token/download`

- Auth required: token-based, plus share access session for restricted links
- Purpose: download a shared file or a file inside a shared folder
- Query parameters:
  - `fileId` required when the share target is a folder
- Behavior:
  - validates link accessibility
  - validates OTP access if needed
  - enforces max download count
  - records access activity
  - streams decrypted content
- Success response:
  - `200` streamed file response
- Common failures:
  - `403` access denied or download limit reached
  - `404` link or file not found
  - `410` expired link
  - `429` rate-limited
  - `500` stream failure

### `GET /api/share/:token/preview`

- Auth required: token-based, plus share access session for restricted links
- Purpose: preview a shared file inline
- Query parameters:
  - `fileId` required when previewing a file inside a shared folder
- Behavior:
  - similar to shared download, but does not increment max-download enforcement logic
- Success response:
  - `200` streamed inline response
- Common failures:
  - similar to shared download except download-limit enforcement is not the main path

## Cron Routes

### `GET /api/cron/cleanup`

- Auth required: bearer cron secret
- Purpose: purge expired trash and clean stale uploads
- Success response:
  - `200` with `{ trash, uploads }`
- Common failures:
  - `401` unauthorized
  - `500` cleanup failure

### `POST /api/cron/embeddings?limit=...`

- Auth required: bearer cron secret
- Purpose: requeue semantic indexing retry candidates
- Query parameters:
  - `limit` optional, max `100`
- Success response:
  - `200` with retry sweep result
- Common failures:
  - `400` invalid request
  - `403` invalid cron credentials
  - `503` semantic indexing disabled or unavailable

## Related Server Actions

Not all mutations use route handlers. Important internal mutation surfaces are implemented as Next.js server actions:

- auth: login, signup
- dashboard: logout, profile update, password change, revoke session, revoke other sessions
- files: rename, move, bulk move, bulk delete, create folder, soft delete
- share: create link, revoke link, update share settings
- trash: restore, permanently delete, empty trash

These actions are part of the application contract even though they are not public JSON APIs.

Important distinction:

- if you are integrating from another service, use the documented HTTP routes in this file
- if you are extending the web application itself, many write operations are implemented as server actions rather than external APIs
