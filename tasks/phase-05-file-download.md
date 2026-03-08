# Phase 5 — File Download (Streaming)

> **Objective:** Implement streaming file download and in-browser preview with server-side decryption.

**Depends on:** Phase 4 (Upload must work first)  
**Blueprint ref:** Section 4 (Download Flow)

---

## Tasks

- [ ] **5.1 — Implement download route handler**
  - File: `src/app/api/files/[id]/download/route.ts`
  - GET: auth check → get file record → verify ownership → decrypt FEK with UEK
  - Stream chunks from R2 → decrypt each with FEK → pipe to response
  - Use `ReadableStream` for memory-efficient streaming
  - Set headers: `Content-Type`, `Content-Disposition: attachment; filename="..."`, `Content-Length` (compute from `files.size` — the original unencrypted size — so browsers can show download progress bars)

- [ ] **5.2 — Implement preview route handler**
  - File: `src/app/api/files/[id]/preview/route.ts`
  - Same decryption flow as download
  - Set `Content-Disposition: inline` (browser displays instead of downloading)
  - Only allow preview for safe MIME types: images, PDFs, text, video, audio
  - Serve in sandboxed context

- [ ] **5.3 — Implement parallel chunk pipeline**
  - In download route: start fetching chunk N+1 from R2 while decrypting chunk N
  - Reduces total download time for multi-chunk files

- [ ] **5.4 — Build download button component**
  - File: `src/components/file-explorer/download-button.tsx`
  - Uses browser `fetch()` + `blob` + `URL.createObjectURL` + `a.click()` pattern
  - Shows download progress for large files

- [ ] **5.5 — Build file preview component**
  - File: `src/components/file-explorer/file-preview.tsx`
  - Image preview: `<img>` tag
  - PDF preview: `<iframe sandbox="allow-same-origin">`
  - Video/audio preview: `<video>` / `<audio>` tags
  - Text preview: code/text viewer
  - Other files: show file info with download button

---

## Deliverables

| Output            | Location                                           |
| ----------------- | -------------------------------------------------- |
| Download API      | `src/app/api/files/[id]/download/route.ts`         |
| Preview API       | `src/app/api/files/[id]/preview/route.ts`          |
| Download button   | `src/components/file-explorer/download-button.tsx` |
| Preview component | `src/components/file-explorer/file-preview.tsx`    |

---

## Testing

### Automated (Vitest)

```bash
npx vitest run tests/download
```

| Test                                            | Expected                                |
| ----------------------------------------------- | --------------------------------------- |
| Download file owned by user                     | Returns 200 + file bytes match original |
| Download file NOT owned by user                 | Returns 404 (IDOR protection)           |
| Download non-existent file                      | Returns 404                             |
| Preview sets `Content-Disposition: inline`      | Header correct                          |
| Download sets `Content-Disposition: attachment` | Header correct                          |

### Manual Verification (Browser)

1. Upload a small image → click Download → verify downloaded file matches original
2. Upload a PDF → click Preview → verify it renders in browser
3. Upload a 15MB file → download it → verify file integrity (compare checksums)
4. Try accessing `/api/files/{otherUsersFileId}/download` → verify 404
