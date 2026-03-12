# API References

> Internal API endpoint reference for SecureVault.

## Authentication APIs

| Method | Endpoint                    | Body                        | Response                                  | Auth |
| ------ | --------------------------- | --------------------------- | ----------------------------------------- | ---- |
| POST   | `/api/auth/signup`          | `{ email, password, name }` | `{ userId }` + set `__Secure-` cookies    | No   |
| POST   | `/api/auth/login`           | `{ email, password }`       | `{ userId }` + set `__Secure-` cookies    | No   |
| POST   | `/api/auth/logout`          | -                           | `{ success }` + clear `__Secure-` cookies | Yes  |
| POST   | `/api/auth/forgot-password` | `{ email }`                 | `{ message }`                             | No   |
| POST   | `/api/auth/reset-password`  | `{ token, newPassword }`    | `{ success }`                             | No   |
| GET    | `/api/auth/verify-email`    | `?token=...`                | Redirect                                  | No   |

## Upload APIs

| Method | Endpoint               | Body / Transport                                  | Response                            | Auth |
| ------ | ---------------------- | ------------------------------------------------- | ----------------------------------- | ---- |
| POST   | `/api/upload/init`     | `{ fileName, fileSize, mimeType }`                | `{ uploadId, fileId, totalChunks }` | Yes  |
| POST   | `/api/upload/chunk`    | Raw binary body + headers `x-upload-id`, `x-chunk-index` | `{ chunkIndex, status }`            | Yes  |
| POST   | `/api/upload/complete` | `{ uploadId }`                                    | `{ fileId, status }`                | Yes  |

## PDF Embedding APIs

| Method | Endpoint                       | Body                             | Response                                                              | Auth |
| ------ | ------------------------------ | -------------------------------- | --------------------------------------------------------------------- | ---- |
| POST   | `/api/embeddings/pdf`          | `{ fileId }`                     | `{ jobId, status, reason? }`                                          | Yes  |
| GET    | `/api/embeddings/pdf/{fileId}` | -                                | `{ fileId, status, eligible, progress?, indexedChunks?, lastError? }` | Yes  |
| POST   | `/api/search/semantic`         | `{ query, limit?, folderId? }`   | `{ results: [{ fileId, name, score, snippet, pageFrom, pageTo }] }`  | Yes  |

## File APIs

| Method | Endpoint                    | Response               | Auth |
| ------ | --------------------------- | ---------------------- | ---- |
| GET    | `/api/files/{id}/download`  | Streamed file bytes    | Yes  |
| GET    | `/api/files/{id}/preview`   | Streamed file (inline) | Yes  |
| GET    | `/api/files/{id}/thumbnail` | WebP thumbnail         | Yes  |

## Share APIs

| Method | Endpoint                | Body                     | Response              | Auth |
| ------ | ----------------------- | ------------------------ | --------------------- | ---- |
| POST   | `/api/share/create`     | `{ fileId, options }`    | `{ token, shareUrl }` | Yes  |
| POST   | `/api/share/revoke`     | `{ linkId }`             | `{ success }`         | Yes  |
| POST   | `/api/share/verify-otp` | `{ token, email, code }` | `{ accessGranted }`   | No   |
| POST   | `/api/share/send-otp`   | `{ token, email }`       | `{ sent }`            | No   |

## Pages

| Route                 | Description              | Auth |
| --------------------- | ------------------------ | ---- |
| `/login`              | Login page               | No   |
| `/signup`             | Registration page        | No   |
| `/dashboard/files`    | File explorer            | Yes  |
| `/dashboard/activity` | Audit log                | Yes  |
| `/dashboard/settings` | User settings            | Yes  |
| `/dashboard/trash`    | Deleted files            | Yes  |
| `/s/{token}`          | Public share link viewer | No   |

## Response Codes

| Code  | Meaning                                                               |
| ----- | --------------------------------------------------------------------- |
| `200` | Success                                                               |
| `401` | Unauthorized (not logged in or session expired)                       |
| `403` | Forbidden (rate limited, quota exceeded, OTP locked)                  |
| `404` | Not found (also used for IDOR - no distinction)                       |
| `409` | Conflict (file not ready for indexing or duplicate in-progress job)   |
| `413` | File too large or quota exceeded                                      |
| `422` | Semantic indexing skipped or unsupported for this file                |
| `429` | Too many requests (rate limited)                                      |
| `500` | Internal server error                                                 |
