# Phase 22 - Secure Shared PDF Image Preview

> **Objective:** Replace browser-native PDF preview only on shared links with a secure, scrollable, server-rendered image preview. Authenticated owner previews and original downloads should continue to work exactly as they do today.

**Depends on:** Phase 1 (DB), Phase 2 (Encryption), Phase 4 (Upload), Phase 5 (Download/Preview), Phase 8 (Link Sharing), Phase 10 (Trash), Phase 12 (Security Hardening)  
**Related phases:** Phase 9 (Thumbnails), Phase 19 (PDF Semantic Indexing), Phase 21 (OCR-Backed Hybrid Retrieval)

> [!IMPORTANT]
> This phase is shared-preview-only. Do not change the signed-in owner PDF preview in `secure-vault/src/components/files/file-preview.tsx` unless a later phase explicitly expands this feature.

---

## Required Product Behavior

When a visitor opens a shared PDF link:

- The shared file page renders the PDF as a vertically scrollable list of server-rendered page images.
- The visitor browser receives `image/webp` page responses, not `application/pdf`.
- The visitor browser does not receive original PDF bytes through the preview path.
- The existing shared download button still downloads the original PDF through the current download route if download is allowed.
- Public, restricted, OTP-gated, expired, revoked, and folder-share access rules still apply.
- Preview requests do not consume share download count.
- Preview page image requests do not create one access log entry per page.

When the signed-in owner previews a PDF from the files page:

- Behavior remains unchanged in this phase.
- The existing owned preview route can continue to serve the original PDF inline.
- Existing owned preview tests should not be rewritten for this phase except where shared-only helpers touch common code.

This phase does not try to prevent:

- screenshots
- screen recording
- OCR of rendered page images
- copying visible content from an authorized shared preview session

---

## Mandatory Implementation Decisions

These choices are fixed for v1 so implementers do not need to guess.

| Decision | v1 Choice |
| --- | --- |
| Scope | Shared PDF preview only |
| Owned/internal PDF preview | Leave unchanged |
| Renderer | Poppler CLI tools installed in Docker |
| Render command | `pdftocairo` |
| Output image type | WebP served as `image/webp` |
| Rendering mode | Lazy per-page rendering on first shared page request |
| Preview cache | Encrypted rendered page images stored in R2 |
| Derivative encryption | Use the original file FEK to encrypt preview image bytes |
| Storage quota | Do not count generated preview images toward user storage quota |
| Fallback behavior | Do not fall back to inline original-PDF preview on shared links |
| Deployment target | Docker is supported. Serverless without Poppler returns a controlled unavailable response |
| Access logging | Shared PDF preview logs once on manifest request, not once per page |
| Download limits | Shared preview requests do not increment download count |

---

## Current Implementation Snapshot

- [x] Shared PDF preview currently uses an iframe in `secure-vault/src/components/share/shared-file-view.tsx`.
- [x] Shared preview route `secure-vault/src/app/api/share/[token]/preview/route.ts` streams decrypted original bytes through `streamSharedFile`.
- [x] Shared download route `secure-vault/src/app/api/share/[token]/download/route.ts` downloads original files and enforces download limits.
- [x] Shared route access checks are implemented with:
  - `requireShareLinkByToken`
  - `assertShareLinkAccessible`
  - `requireValidShareAccessSession`
  - `requireFolderShareTargetFile`
  - `recordShareAccess`
- [x] `secure-vault/src/app/api/files/[id]/service.ts` already has `streamSharedFile`, which reconstructs encrypted chunks and streams decrypted bytes.
- [x] `secure-vault/src/lib/files/file-bytes.ts` reconstructs owned decrypted file bytes, but not shared file bytes.
- [x] Upload MIME detection already uses `file-type` in `secure-vault/src/app/api/upload/chunk/service.ts`.
- [x] PDF files are currently the only allowed document type in `secure-vault/src/lib/constants/upload.ts`.
- [x] Existing shared E2E tests expect PDF preview iframe behavior in `secure-vault/tests/e2e/share-preview-variants.spec.ts`.
- [ ] There is no shared PDF image preview component.
- [ ] There is no shared PDF preview manifest route.
- [ ] There is no shared PDF preview page-image route.
- [ ] There is no server-side PDF rasterization dependency.
- [ ] There is no `pdf_preview_pages` table.
- [ ] There is no reusable shared file-byte reader for rendering.

---

## Non-Goals

Do not implement these in Phase 22:

- Do not replace authenticated owner PDF preview.
- Do not remove `/api/files/:id/preview`.
- Do not add owned `/api/files/:id/pdf-preview` routes.
- Do not change current image preview behavior.
- Do not count preview derivatives toward user storage quota.
- Do not introduce background jobs in v1.
- Do not expose R2 signed URLs for preview pages.

---

## Target Shared API Contract

### Shared Manifest

Route:

```http
GET /api/share/:token/pdf-preview?fileId=:fileId
```

Access rules:

- If share target is a file, ignore `fileId` and use the linked file.
- If share target is a folder, require `fileId`.
- For folder shares, `fileId` must be inside the shared folder subtree.
- Public shares do not require a share access session.
- Restricted shares require a valid share access session.
- Revoked links return `404`.
- Expired links return `410`.
- Manifest success records one share access event.
- Manifest success does not increment download count.

Success response:

```json
{
  "fileId": "abc123",
  "fileName": "report.pdf",
  "mimeType": "application/pdf",
  "pageCount": 3,
  "renderVersion": 1,
  "pages": [
    {
      "page": 1,
      "status": "ready",
      "width": 1240,
      "height": 1754,
      "src": "/api/share/share-token/pdf-preview/pages/1"
    },
    {
      "page": 2,
      "status": "pending",
      "width": null,
      "height": null,
      "src": "/api/share/share-token/pdf-preview/pages/2"
    }
  ]
}
```

For folder shares, `src` must include the file query:

```json
{
  "src": "/api/share/share-token/pdf-preview/pages/1?fileId=abc123"
}
```

Status codes:

| Case | Status | Body |
| --- | --- | --- |
| Unknown token | `404` | `{ "error": "Share link not found" }` |
| Revoked token | `404` | `{ "error": "Share link not found" }` |
| Expired token | `410` | `{ "error": "Share link is expired" }` |
| Restricted share without valid session | `403` | `{ "error": "Access denied" }` |
| Folder share missing/invalid `fileId` | `404` | `{ "error": "Share link not found" }` |
| Non-PDF file | `415` | `{ "error": "PDF image preview is only supported for PDF files" }` |
| Feature disabled | `503` | `{ "error": "PDF image preview is not enabled" }` |
| Renderer missing | `503` | `{ "error": "PDF image preview renderer is unavailable" }` |
| PDF over configured byte limit | `413` | `{ "error": "PDF is too large for secure preview" }` |
| PDF over configured page limit | `413` | `{ "error": "PDF has too many pages for secure preview" }` |
| Malformed/encrypted/unsupported PDF | `422` | `{ "error": "PDF cannot be rendered for secure preview" }` |

### Shared Page Image

Route:

```http
GET /api/share/:token/pdf-preview/pages/:page?fileId=:fileId
```

Access rules:

- Repeat all shared access checks from the manifest route.
- Do not assume a manifest request already happened.
- Do not call `recordShareAccess`.
- Do not call `assertDownloadAllowed`.
- Do not increment share download count.

Success response:

- Status: `200`
- `Content-Type: image/webp`
- `Cache-Control: private, no-store`
- `Content-Length: <decrypted-image-byte-length>`
- `X-Content-Type-Options: nosniff`
- Body: decrypted WebP page image bytes

Status codes:

| Case | Status |
| --- | --- |
| Unknown/revoked token | `404` |
| Expired token | `410` |
| Restricted share without valid session | `403` |
| Folder share missing/invalid `fileId` | `404` |
| Non-PDF file | `415` |
| Page is not a positive integer | `400` |
| Page is greater than PDF page count | `404` |
| Feature disabled or renderer unavailable | `503` |
| PDF/page cannot be rendered | `422` |

---

## Environment Variables

Add to:

- `secure-vault/.env.example`
- `secure-vault/README.md`

```env
# Secure server-side image preview for shared PDF links only.
SHARED_PDF_IMAGE_PREVIEW_ENABLED=false

# Maximum original PDF size eligible for shared image preview.
# Default: 25 MiB. Must be <= MAX_UPLOAD_SIZE_BYTES.
SHARED_PDF_IMAGE_PREVIEW_MAX_BYTES=26214400

# Maximum page count eligible for shared image preview.
SHARED_PDF_IMAGE_PREVIEW_MAX_PAGES=100

# Rasterization DPI. Higher means sharper text but more CPU/memory/storage.
SHARED_PDF_IMAGE_PREVIEW_DPI=144

# Maximum rendered WebP output bytes per page.
SHARED_PDF_IMAGE_PREVIEW_MAX_PAGE_IMAGE_BYTES=2097152

# Preview derivative version. Bump when render settings or output format changes.
SHARED_PDF_IMAGE_PREVIEW_RENDER_VERSION=1
```

Parsing rules:

- Missing `SHARED_PDF_IMAGE_PREVIEW_ENABLED` means `false`.
- Parse numeric values as positive integers.
- Reject invalid numeric values during config load with a clear server-side error.
- Do not silently clamp invalid config.
- If enabled and Poppler is missing, shared PDF preview routes return `503`.

Create:

- `secure-vault/src/lib/pdf-preview/config.ts`

Export:

```ts
export type SharedPdfPreviewConfig = {
  dpi: number;
  enabled: boolean;
  maxBytes: number;
  maxPageImageBytes: number;
  maxPages: number;
  renderVersion: number;
};

export function getSharedPdfPreviewConfig(): SharedPdfPreviewConfig;
```

---

## Database Schema

The rendered shared preview pages are file derivatives. Store one encrypted image record per file page and render version.

### Add Schema File

Create:

- `secure-vault/src/lib/db/schema/pdf-preview-pages.ts`

Schema:

```ts
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  bigint,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import { files } from "@/lib/db/schema/files";
import { mysqlBlob } from "@/lib/db/schema/_custom-types";

export const pdfPreviewPages = mysqlTable(
  "pdf_preview_pages",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    file_id: varchar("file_id", { length: 21 })
      .notNull()
      .references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" }),
    page_number: int("page_number").notNull(),
    render_version: int("render_version").notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    mime_type: varchar("mime_type", { length: 64 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    r2_key: varchar("r2_key", { length: 512 }).notNull(),
    iv: mysqlBlob("iv").notNull(),
    auth_tag: mysqlBlob("auth_tag").notNull(),
    status: mysqlEnum("status", ["ready", "failed"]).notNull(),
    error_message: varchar("error_message", { length: 1024 }),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_pdf_preview_file_page_version").on(
      table.file_id,
      table.page_number,
      table.render_version,
    ),
    index("idx_pdf_preview_file_status").on(table.file_id, table.status),
  ],
);

export type PdfPreviewPage = InferSelectModel<typeof pdfPreviewPages>;
export type PdfPreviewPageInsert = InferInsertModel<typeof pdfPreviewPages>;
```

### Update Schema Index

Update:

- `secure-vault/src/lib/db/schema/index.ts`

Add import/export:

```ts
import { pdfPreviewPages } from "@/lib/db/schema/pdf-preview-pages";
export * from "@/lib/db/schema/pdf-preview-pages";
```

Add relation to `filesRelations`:

```ts
pdfPreviewPages: many(pdfPreviewPages),
```

Add relation:

```ts
export const pdfPreviewPagesRelations = relations(pdfPreviewPages, ({ one }) => ({
  file: one(files, { fields: [pdfPreviewPages.file_id], references: [files.id] }),
}));
```

### Add Migration

Create:

- `secure-vault/drizzle/0010_pdf_preview_pages.sql`

Migration must:

- create `pdf_preview_pages`
- add `ON DELETE CASCADE` to `file_id`
- add unique index `(file_id, page_number, render_version)`
- add index `(file_id, status)`

Do not rely only on DB cascade. R2 preview objects must also be deleted during hard purge.

---

## R2 Storage and Encryption

Add helper to:

- `secure-vault/src/lib/storage/r2.ts`

```ts
export function buildPdfPreviewR2Key(input: {
  fileId: string;
  pageNumber: number;
  renderVersion: number;
  userId: string;
}) {
  return `${input.userId}/previews/pdf/${input.fileId}/v${input.renderVersion}/page_${input.pageNumber}.webp`;
}
```

Preview cleanup prefix:

```ts
`${userId}/previews/pdf/${fileId}/`
```

Encryption rules:

- Rendered WebP bytes must be encrypted before R2 upload.
- Use the original file FEK with `createEncryptStream`.
- Store the preview image IV and auth tag in `pdf_preview_pages`.
- Use `createDecryptStream` to serve cached page images.
- Never expose R2 signed URLs for preview pages.
- Never store rendered page images in `public`.

Quota rules:

- Do not add preview derivative size to `users.storage_used`.
- Do not subtract preview derivative size from `users.storage_used` during cleanup.

---

## Renderer Dependency

### Dockerfile

Update:

- `secure-vault/Dockerfile`

Add:

```Dockerfile
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*
```

### Renderer Probe

Create:

- `secure-vault/src/lib/pdf-preview/renderer-probe.ts`

Use `node:child_process` `spawn` with explicit args. Do not use shell string execution.

Function:

```ts
export async function assertPdfRendererAvailable(): Promise<void>;
```

Behavior:

- Run `pdftocairo -v`.
- Cache successful probe result in memory.
- Throw `PdfPreviewError("RENDERER_UNAVAILABLE", ...)` if command is missing or fails.

Tests:

- `pdftocairo` available.
- executable missing with `ENOENT`.
- non-zero exit.
- cached success avoids repeated spawn.

---

## PDF Preview Module Layout

Create directory:

- `secure-vault/src/lib/pdf-preview`

Files:

| File | Responsibility |
| --- | --- |
| `config.ts` | Parse shared PDF preview env config |
| `errors.ts` | Typed errors and route status mapping |
| `renderer-probe.ts` | Check Poppler availability |
| `renderer.ts` | Page count and single-page rasterization |
| `repository.ts` | DB access for preview page metadata |
| `shared-service.ts` | Shared preview manifest/page orchestration |
| `types.ts` | Shared DTO types |

### Error Type

Create in:

- `secure-vault/src/lib/pdf-preview/errors.ts`

```ts
export type PdfPreviewErrorCode =
  | "FEATURE_DISABLED"
  | "RENDERER_UNAVAILABLE"
  | "SHARE_ACCESS_DENIED"
  | "FILE_NOT_FOUND"
  | "UNSUPPORTED_MIME"
  | "PDF_TOO_LARGE"
  | "PDF_TOO_MANY_PAGES"
  | "INVALID_PAGE"
  | "PAGE_NOT_FOUND"
  | "PDF_RENDER_FAILED"
  | "PDF_PARSE_FAILED"
  | "R2_READ_FAILED"
  | "R2_WRITE_FAILED"
  | "DECRYPT_FAILED";

export class PdfPreviewError extends Error {
  code: PdfPreviewErrorCode;
  status: number;
}
```

Status mapping:

| Code | Status |
| --- | --- |
| `FEATURE_DISABLED` | `503` |
| `RENDERER_UNAVAILABLE` | `503` |
| `SHARE_ACCESS_DENIED` | `403` |
| `FILE_NOT_FOUND` | `404` |
| `UNSUPPORTED_MIME` | `415` |
| `PDF_TOO_LARGE` | `413` |
| `PDF_TOO_MANY_PAGES` | `413` |
| `INVALID_PAGE` | `400` |
| `PAGE_NOT_FOUND` | `404` |
| `PDF_RENDER_FAILED` | `422` |
| `PDF_PARSE_FAILED` | `422` |
| `R2_READ_FAILED` | `500` |
| `R2_WRITE_FAILED` | `500` |
| `DECRYPT_FAILED` | `500` |

Response helpers:

- Shared routes should return `{ error: message }`.
- Do not return `{ message: ... }` from shared PDF preview routes, because existing shared routes use `{ error }`.

---

## Shared File Byte Reader

Add to:

- `secure-vault/src/lib/files/file-bytes.ts`

Function:

```ts
export async function readSharedFileBytes(input: {
  fileId: string;
  ownerId: string;
  signal?: AbortSignal;
}): Promise<{
  bytes: Buffer;
  file: {
    encryptedFek: Buffer;
    mimeType: string;
    name: string;
    size: number;
    totalChunks: number;
  };
  ownerUek: Buffer;
} | null>;
```

Implementation rules:

1. Load owner encrypted UEK from `users`.
2. If owner does not exist, return `null`.
3. Decrypt owner UEK with `decryptUEK`.
4. Find file by `fileId`, `ownerId`, `status = "ready"`, and `deleted_at is null`.
5. Validate chunk count and chunk indexes exactly like owned reads.
6. Decrypt the file FEK with the owner UEK.
7. Fetch and decrypt all file chunks from R2.
8. Return decrypted bytes and file metadata.

Do not:

- validate the share token in this helper
- record share access in this helper
- increment download count in this helper
- change `streamSharedFile`
- change `streamOwnedFile`
- change `readOwnedFileBytes` behavior

Tests:

- returns bytes for valid owner/file
- returns `null` for missing owner
- returns `null` for missing file
- returns `null` for soft-deleted file
- returns `null` for not-ready file
- throws stable error for incomplete chunks
- throws stable error for inconsistent chunk indexes
- throws stable error for FEK decrypt failure
- passes abort signal to R2 object reads

---

## Renderer Implementation

Create:

- `secure-vault/src/lib/pdf-preview/renderer.ts`

### Page Count

Function:

```ts
export async function getPdfPageCount(input: {
  bytes: Buffer;
}): Promise<number>;
```

Implementation:

- Use `pdf-lib` `PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false })`.
- Return `document.getPageCount()`.
- If load fails, throw `PdfPreviewError("PDF_PARSE_FAILED", "PDF cannot be rendered for secure preview")`.
- If page count is `0`, throw `PDF_PARSE_FAILED`.

### Single Page Render

Function:

```ts
export async function renderPdfPageToWebp(input: {
  bytes: Buffer;
  dpi: number;
  maxOutputBytes: number;
  pageNumber: number;
  signal?: AbortSignal;
}): Promise<{
  bytes: Buffer;
  height: number;
  mimeType: "image/webp";
  width: number;
}>;
```

Algorithm:

1. Validate `pageNumber` is a positive integer.
2. Create a temp directory with `fs.promises.mkdtemp(path.join(os.tmpdir(), "securevault-shared-pdf-preview-"))`.
3. Write PDF bytes to `${tempDir}/source.pdf`.
4. Spawn `pdftocairo` with args:

   ```text
   -png -singlefile -f {pageNumber} -l {pageNumber} -r {dpi} source.pdf page
   ```

5. Expected output is `${tempDir}/page.png`.
6. Read `page.png`.
7. Convert with `sharp`:

   ```ts
   const image = sharp(pngBytes).rotate();
   const metadata = await image.metadata();
   const webpBytes = await image.webp({ quality: 82, effort: 4 }).toBuffer();
   ```

8. If output exceeds `maxOutputBytes`, retry once with `quality: 68`.
9. If output still exceeds limit, throw `PDF_RENDER_FAILED`.
10. Always delete the temp directory in `finally`.

Abort behavior:

- If request signal aborts, kill the child process.
- Cleanup temp directory.
- Let the route terminate safely.

Security rules:

- Do not include original filenames in temp paths.
- Do not use shell command strings.
- Do not log PDF bytes or rendered image bytes.
- Only pass validated `pageNumber` and configured `dpi` to the command.

Tests:

- render success returns WebP bytes
- invalid page number rejects before spawn
- Poppler non-zero maps to `PDF_RENDER_FAILED`
- missing output file maps to `PDF_RENDER_FAILED`
- `sharp` failure maps to `PDF_RENDER_FAILED`
- temp directory removed on success
- temp directory removed on Poppler failure
- temp directory removed on `sharp` failure
- abort kills child process
- oversized output retries once
- oversized output after retry fails

---

## Repository Implementation

Create:

- `secure-vault/src/lib/pdf-preview/repository.ts`

Functions:

```ts
export async function getPreviewPage(input: {
  fileId: string;
  pageNumber: number;
  renderVersion: number;
}): Promise<PdfPreviewPage | null>;

export async function listPreviewPages(input: {
  fileId: string;
  renderVersion: number;
}): Promise<PdfPreviewPage[]>;

export async function insertReadyPreviewPage(input: {
  authTag: Buffer;
  fileId: string;
  height: number;
  id: string;
  iv: Buffer;
  mimeType: "image/webp";
  pageNumber: number;
  r2Key: string;
  renderVersion: number;
  size: number;
  width: number;
}): Promise<void>;

export async function markPreviewPageFailed(input: {
  errorMessage: string;
  fileId: string;
  pageNumber: number;
  renderVersion: number;
}): Promise<void>;

export async function listPreviewPagesForFiles(fileIds: string[]): Promise<PdfPreviewPage[]>;
```

Race behavior:

- Two visitors may request the same page at the same time.
- The unique index must allow only one ready row for `(file_id, page_number, render_version)`.
- If duplicate insert happens, fetch and serve the existing record.
- If R2 upload succeeds and DB insert fails for a non-duplicate reason, delete the just-uploaded R2 object.
- If cleanup fails, log safe metadata: `fileId`, `pageNumber`, `r2Key`, error message.

---

## Shared Service Implementation

Create:

- `secure-vault/src/lib/pdf-preview/shared-service.ts`

### Manifest Function

```ts
export async function getSharedPdfPreviewManifest(input: {
  fileId: string;
  ownerId: string;
  pageBaseUrl: string;
  signal?: AbortSignal;
}): Promise<PdfPreviewManifest>;
```

Algorithm:

1. Load config.
2. If disabled, throw `FEATURE_DISABLED`.
3. Probe renderer availability.
4. Read shared file bytes with `readSharedFileBytes`.
5. If no file, throw `FILE_NOT_FOUND`.
6. If MIME is not `application/pdf`, throw `UNSUPPORTED_MIME`.
7. If file size exceeds max bytes, throw `PDF_TOO_LARGE`.
8. Get page count.
9. If page count exceeds max pages, throw `PDF_TOO_MANY_PAGES`.
10. Load existing preview page records for file/render version.
11. Return one page item for every page number from `1` through `pageCount`.
12. Existing ready pages include width/height/status `ready`.
13. Missing pages are status `pending`.
14. Failed rows are status `failed`.
15. Build each page `src` from `pageBaseUrl`.

### Page Function

```ts
export async function getSharedPdfPreviewPage(input: {
  fileId: string;
  ownerId: string;
  pageNumber: number;
  signal?: AbortSignal;
}): Promise<Response>;
```

Algorithm:

1. Validate page number is a positive integer.
2. Load config.
3. If disabled, throw `FEATURE_DISABLED`.
4. Probe renderer availability.
5. Read shared file bytes.
6. If no file, throw `FILE_NOT_FOUND`.
7. Validate MIME and file size.
8. Get page count.
9. If page number exceeds page count, throw `PAGE_NOT_FOUND`.
10. Decrypt file FEK with owner UEK.
11. Look for existing ready preview page record.
12. If found:
    - fetch encrypted WebP from R2
    - decrypt with file FEK, IV, auth tag
    - return WebP response
13. If not found:
    - render page to WebP
    - encrypt WebP with file FEK
    - upload encrypted WebP to R2
    - insert metadata row
    - return decrypted WebP response
14. If duplicate insert happens:
    - delete the just-uploaded duplicate object
    - fetch existing metadata
    - serve existing cached image

Response headers:

```ts
{
  "Cache-Control": "private, no-store",
  "Content-Length": String(imageBytes.byteLength),
  "Content-Type": "image/webp",
  "X-Content-Type-Options": "nosniff",
}
```

---

## Shared Route Implementation

### Shared Manifest Route

Create:

- `secure-vault/src/app/api/share/[token]/pdf-preview/route.ts`

Implementation steps:

1. Rate limit with key:

   ```ts
   `${getClientIpFromHeaders(request.headers)}:${token}`
   ```

2. Load link with `requireShareLinkByToken`.
3. Call `assertShareLinkAccessible`.
4. If restricted, require valid share session with `requireValidShareAccessSession`.
5. Resolve file id:
   - file share: `link.targetId`
   - folder share: `requireFolderShareTargetFile`
6. Build page base URL:
   - file share: `/api/share/${token}/pdf-preview/pages`
   - folder share: `/api/share/${token}/pdf-preview/pages?fileId=${fileId}` is not suitable because page number goes before query
   - use a helper to build final per-page URLs inside manifest service or route
7. Call `getSharedPdfPreviewManifest`.
8. On success, call `recordShareAccess`.
9. Return JSON.

Important:

- Do not call `assertDownloadAllowed`.
- Do not call `streamSharedFile`.
- Do not expose original PDF bytes.

### Shared Page Route

Create:

- `secure-vault/src/app/api/share/[token]/pdf-preview/pages/[page]/route.ts`

Implementation steps:

1. Parse page number.
2. Reject non-integer, zero, negative, and decimal values before service call.
3. Rate limit with same shared preview key.
4. Load link and validate accessible.
5. Validate restricted session if required.
6. Resolve file id exactly like manifest route.
7. Call `getSharedPdfPreviewPage`.
8. Return its image response.

Important:

- Do not call `recordShareAccess`.
- Do not call `assertDownloadAllowed`.
- Do not call `streamSharedFile`.

---

## Frontend Implementation

### Create Shared PDF Viewer

Create:

- `secure-vault/src/components/share/shared-pdf-image-preview.tsx`

Props:

```ts
type SharedPdfImagePreviewProps = {
  fileId?: string;
  fileName?: string;
  token: string;
};
```

Behavior:

- Fetch manifest from:

  ```ts
  const fileQuery = fileId ? `?fileId=${encodeURIComponent(fileId)}` : "";
  const manifestUrl = `/api/share/${token}/pdf-preview${fileQuery}`;
  ```

- Render loading skeleton while manifest loads.
- Render one stable page container per page.
- Use plain `<img>`, not Next `<Image>`.
- Use `loading="lazy"`.
- Use manifest `src` for image URLs.
- Add `data-testid="shared-pdf-preview-page-{page}"`.
- Add `data-testid="shared-pdf-preview-page-image-{page}"`.

Manifest failure UI:

| Status | UI text |
| --- | --- |
| `413` | `This PDF is too large for secure preview. Use download instead.` |
| `415` | `Preview is not supported for this file type. Use download instead.` |
| `422` | `This PDF cannot be rendered for secure preview. Use download instead.` |
| `503` | `Secure PDF preview is unavailable. Use download instead.` |
| Other | `Failed to load PDF preview. Use download instead.` |

### Update Shared File View

Update:

- `secure-vault/src/components/share/shared-file-view.tsx`

Rules:

- Keep image MIME behavior unchanged.
- If `mimeType === "application/pdf"`, render `SharedPdfImagePreview`.
- Do not render iframe for PDFs.
- Keep unsupported type fallback unchanged.
- It is acceptable for non-image, non-PDF types to keep iframe fallback only if they become previewable later. Today only images and PDFs are allowed.

Do not update:

- `secure-vault/src/components/files/file-preview.tsx`

Owned preview remains unchanged in this phase.

---

## Headers and CSP

Update:

- `secure-vault/next.config.ts`

Add header rules for:

- `/api/share/:token/pdf-preview`
- `/api/share/:token/pdf-preview/pages/:page`

Headers:

```ts
{ key: "X-Content-Type-Options", value: "nosniff" }
{ key: "X-Frame-Options", value: "DENY" }
{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
{ key: "Content-Security-Policy", value: contentSecurityPolicy }
```

Do not remove existing preview header exceptions in this phase:

- `/api/files/:id/preview`
- `/api/share/:token/preview`

Reason:

- Owner preview remains unchanged.
- Image preview still uses current preview routes.
- Removing those exceptions is a separate hardening step after broader preview cleanup.

Update:

- `secure-vault/tests/download/headers-config.test.ts`

Assert:

- new shared PDF preview routes are frame-denied
- global frame-deny still applies
- existing preview route rules remain unchanged

---

## Trash and Hard Delete Cleanup

Update:

- `secure-vault/src/app/api/files/trash-service.ts`

When files are permanently purged:

1. Collect file ids and user ids in the purge scope.
2. Query `pdf_preview_pages` for those file ids.
3. Delete every preview page R2 object.
4. Delete preview DB rows, or rely on file row cascade after file delete.

Rules:

- Missing preview R2 objects should be ignored.
- Follow existing purge behavior for non-missing R2 delete failures.
- Folder purge must remove preview objects for every PDF in the subtree.
- Soft delete should not delete preview derivatives yet; hard purge should.

Tests:

- hard delete removes preview page R2 keys
- missing preview object does not crash cleanup
- folder purge removes preview pages for nested PDFs
- soft delete does not delete preview page objects

---

## Production Edge Cases

### PDF Input Edge Cases

| Edge case | Expected behavior |
| --- | --- |
| Valid one-page shared PDF | Manifest page count 1, page 1 returns WebP |
| Valid multi-page shared PDF | Scrollable viewer renders pages lazily |
| Empty or corrupt PDF | `422` |
| Password-protected PDF | `422` |
| PDF with JavaScript/actions | Rendered images only; no PDF bytes sent in preview |
| PDF with huge page dimensions | Render fails safely or output is bounded by config |
| PDF over max bytes | `413` before rendering |
| PDF over max pages | `413` before page rendering |
| Page number 0 | `400` |
| Negative page number | `400` |
| Decimal page number | `400` |
| Non-numeric page number | `400` |
| Page number greater than page count | `404` |

### Shared Access Edge Cases

| Edge case | Expected behavior |
| --- | --- |
| Unknown token | `404` |
| Revoked share | manifest and page return `404` |
| Expired share | manifest and page return `410` |
| Restricted share without session | manifest and page return `403` |
| Restricted share with expired session | manifest and page return `403` |
| Restricted share with valid session | manifest and page can succeed |
| Public file share | manifest and page can succeed |
| Folder share with file inside subtree | manifest and page can succeed |
| Folder share without `fileId` | `404` |
| Folder share with file outside subtree | `404` |
| Share revoked after manifest before page request | page route returns `404` |
| Share expired after manifest before page request | page route returns `410` |
| File soft-deleted after manifest before page request | page route returns `404` |

### Rendering and Storage Edge Cases

| Edge case | Expected behavior |
| --- | --- |
| Poppler missing | `503`, no fallback to PDF |
| Poppler exits non-zero | `422` |
| `sharp` conversion fails | `422` |
| R2 write fails after render | `500`, no ready DB row |
| DB insert fails after R2 write | uploaded preview object is deleted |
| Duplicate concurrent render | one winner; loser serves existing cached image |
| R2 read fails for cached page | `500`; do not leak file details |
| Request aborts during render | child process killed, temp dir cleaned |
| Temp cleanup fails | log safe metadata only |

### UI Edge Cases

| Edge case | Expected behavior |
| --- | --- |
| Manifest loads slowly | skeleton shown |
| One page image fails | page-level failed state, rest of viewer remains usable |
| Manifest fails with `413` | download-oriented preview-unavailable state |
| Manifest fails with `503` | secure preview unavailable state |
| Very long file name | shared page header remains contained |
| Mobile viewport | viewer scrolls inside available height |
| Folder share PDF preview | image URLs preserve `fileId` query |

---

## Test Plan

### Unit Tests

Create:

- `secure-vault/tests/pdf-preview/config.test.ts`
- `secure-vault/tests/pdf-preview/renderer-probe.test.ts`
- `secure-vault/tests/pdf-preview/renderer.test.ts`
- `secure-vault/tests/pdf-preview/repository.test.ts`
- `secure-vault/tests/pdf-preview/shared-service.test.ts`
- `secure-vault/tests/files/shared-file-bytes.test.ts`

Required cases:

| Test file | Required tests |
| --- | --- |
| `config.test.ts` | disabled by default, parses enabled, rejects invalid ints, rejects zero/negative limits |
| `renderer-probe.test.ts` | renderer available, missing executable, non-zero exit, cached success |
| `renderer.test.ts` | page count success, corrupt PDF fails, render success, invalid page rejects, temp cleanup on success/failure, output too large fails |
| `repository.test.ts` | insert ready page, list pages, get page, duplicate handling, failed state |
| `shared-service.test.ts` | manifest success, page success from cache, page render then cache, non-PDF 415, too large 413, too many pages 413, page out of range 404 |
| `shared-file-bytes.test.ts` | owner UEK decrypt, missing owner, missing file, deleted file, chunk inconsistency |

### Shared Route Tests

Create:

- `secure-vault/tests/sharing/share-pdf-preview-routes.test.ts`

Required cases:

- public direct-file manifest success
- public direct-file page success
- restricted share without session returns `403`
- restricted share with session succeeds
- revoked share returns `404`
- expired share returns `410`
- folder share validates file through `requireFolderShareTargetFile`
- folder share missing `fileId` returns `404`
- non-PDF returns `415`
- page `abc` returns `400`
- page `1.5` returns `400`
- page `0` returns `400`
- manifest records access once
- page does not record access
- manifest does not call `assertDownloadAllowed`
- page does not call `assertDownloadAllowed`
- neither route calls `streamSharedFile`

### Component Tests

Create or update:

- `secure-vault/tests/sharing/shared-pdf-image-preview.test.tsx`
- `secure-vault/tests/sharing/shared-file-view.test.tsx`

Required assertions:

- shared PDF preview renders no iframe
- shared PDF preview calls manifest route
- shared PDF preview renders page image URLs from manifest
- shared PDF preview preserves `fileId` query for folder shares
- shared PDF preview shows useful error for `413`, `422`, and `503`
- shared image preview still renders current image path
- unsupported shared file preview fallback remains unchanged

Do not rewrite owned file preview component tests for this phase.

### E2E Tests

Update:

- `secure-vault/tests/e2e/share-preview-variants.spec.ts`

Shared PDF expected checks:

- Upload or fixture-create `tiny.pdf`.
- Create a public file share.
- Open `/s/:token`.
- Assert no `shared-preview-frame` exists for PDF.
- Assert at least one `shared-pdf-preview-page-image-1` is visible.
- Assert network sees `GET /api/share/:token/pdf-preview`.
- Assert network sees `GET /api/share/:token/pdf-preview/pages/1`.
- Assert page image response `content-type` contains `image/webp`.
- Assert no shared PDF preview request returns `application/pdf`.

Restricted share checks:

- Restricted PDF share still shows auth view before OTP/session.
- After valid session, image preview loads.
- After logout/session invalidation, manifest and page routes return `403`.

Folder share checks:

- Open shared folder.
- Navigate to nested PDF.
- Preview renders image pages.
- Page image URL includes `fileId`.

Do not update `secure-vault/tests/e2e/upload-smoke.spec.ts` unless it directly asserts shared preview behavior. Owned upload smoke PDF preview should remain unchanged.

### Manual Production-Like QA

Run with:

```bash
SHARED_PDF_IMAGE_PREVIEW_ENABLED=true npm run dev:host
```

Manual checklist:

1. Upload `sample_upload_test_file/tiny.pdf`.
2. Create a public share for the PDF.
3. Open the public share in a fresh browser context.
4. Confirm shared preview renders WebP page images.
5. Confirm browser network traffic for preview contains JSON and WebP only.
6. Confirm no shared preview response returns `application/pdf`.
7. Click shared download and confirm original PDF still downloads.
8. Create a restricted share and confirm OTP/session still gates preview.
9. Revoke the share and confirm manifest and page routes reject.
10. Create a folder share containing a nested PDF and confirm preview preserves folder access checks.
11. Permanently delete the PDF and confirm preview R2 keys are deleted.

---

## Rollout Steps

Implement in this exact order.

### Step 1 - Add Config and Errors

- Add `config.ts`.
- Add `errors.ts`.
- Add unit tests.
- No route/UI changes yet.

### Step 2 - Add DB Schema and Migration

- Add `pdf-preview-pages.ts`.
- Export schema and relations.
- Add migration.
- Add repository tests.

### Step 3 - Add Poppler Renderer

- Add `poppler-utils` to Dockerfile.
- Add `renderer-probe.ts`.
- Add `renderer.ts`.
- Add renderer tests.

### Step 4 - Add Shared Byte Reader

- Add `readSharedFileBytes`.
- Keep `streamSharedFile` and `readOwnedFileBytes` behavior unchanged.
- Run existing download/share route tests.

### Step 5 - Add Shared Preview Service

- Add `shared-service.ts`.
- Implement manifest and page functions.
- Test all service edge cases with mocked renderer/R2/DB.

### Step 6 - Add Shared Routes

- Add shared manifest route.
- Add shared page-image route.
- Add route tests for public, restricted, folder, expired, revoked, invalid pages, and rate limits.

### Step 7 - Add Shared Frontend Viewer

- Add `shared-pdf-image-preview.tsx`.
- Update `shared-file-view.tsx` only.
- Confirm owned `file-preview.tsx` is untouched.

### Step 8 - Add Headers and E2E

- Add new shared PDF preview header rules.
- Update header tests.
- Update shared preview E2E tests.

### Step 9 - Add Hard Delete Cleanup

- Update trash purge cleanup.
- Add tests for preview derivative object cleanup.

### Step 10 - Final Regression

Run:

```bash
npm test -- tests/pdf-preview
npm test -- tests/sharing/share-pdf-preview-routes.test.ts
npm test -- tests/sharing/shared-pdf-image-preview.test.tsx
npm test -- tests/sharing/shared-file-view.test.tsx
npm test -- tests/download
npm test -- tests/sharing
```

Run managed E2E for share preview if environment supports it:

```bash
npm run test:e2e:managed -- tests/e2e/share-preview-variants.spec.ts
```

---

## Security Checklist

- [ ] Shared PDF preview page endpoints never return `application/pdf`.
- [ ] Shared PDF preview page endpoints return only `image/webp`.
- [ ] Shared PDF preview UI does not render an iframe for PDFs.
- [ ] Shared PDF preview routes do not call `streamSharedFile`.
- [ ] Shared original PDF bytes remain available only through shared download routes.
- [ ] Signed-in owner PDF preview remains unchanged.
- [ ] Rendered preview derivatives are encrypted in R2.
- [ ] Rendered preview derivatives use per-page IV/auth tag values.
- [ ] Renderer command uses `spawn` with args, never shell interpolation.
- [ ] Temp paths do not include user filenames.
- [ ] Temp files are removed after success, failure, and abort.
- [ ] Page count, file size, DPI, and output bytes are bounded.
- [ ] Shared page requests repeat full access validation.
- [ ] Shared preview does not consume download count.
- [ ] Shared page requests do not write per-page access logs.
- [ ] R2 preview derivatives are deleted on hard purge.
- [ ] Logs never include PDF contents or rendered image bytes.

---

## Acceptance Criteria

- [ ] `SHARED_PDF_IMAGE_PREVIEW_ENABLED=false` keeps shared routes stable and returns controlled unavailable responses from new PDF preview routes.
- [ ] `SHARED_PDF_IMAGE_PREVIEW_ENABLED=true` enables shared PDF image preview.
- [ ] Shared PDF preview is scrollable and image-based.
- [ ] Shared PDF preview sends no original PDF bytes through preview endpoints.
- [ ] Shared PDF download still downloads the original PDF.
- [ ] Existing shared image previews still work.
- [ ] Signed-in owner PDF preview remains unchanged.
- [ ] Shared public, restricted, expired, revoked, and folder access rules are preserved.
- [ ] Rendered page images are encrypted at rest in R2.
- [ ] Concurrent shared page render requests do not corrupt DB or R2 state.
- [ ] Hard-delete cleanup removes shared PDF preview derivatives.
- [ ] Unit, route, component, and E2E tests cover the edge cases listed in this plan.
