# Phase 9 — Thumbnail Generation

> **Objective:** Generate encrypted thumbnails for images during upload, serve via decryption pipeline.

**Depends on:** Phase 5 (Download/preview)  
**Blueprint ref:** Section 17 (Thumbnails)

---

## Tasks

- [ ] **9.1 — Implement thumbnail generator**
  - File: `src/lib/storage/thumbnail.ts`
  - `generateThumbnail(fileBuffer: Buffer, mimeType: string): Promise<Buffer | null>`
  - Images (jpg, png, webp, gif): use `sharp` → resize to 256x256 (cover), output WebP, max 50KB
  - Other file types: return `null` (use generic icon on frontend)
  - Stretch: PDF first-page rendering, video frame extraction

- [ ] **9.2 — Integrate thumbnail into upload complete**
  - In `src/app/api/upload/complete/route.ts`:
    - After all chunks confirmed, detect if MIME is an image type
    - Since upload chunks are **streamed directly to R2** (never buffered in server memory), thumbnail generation must **re-fetch** the first chunk(s) from R2 → decrypt with FEK → pass buffer to `sharp`
    - For small images (single chunk): fetch chunk_0 from R2, decrypt, generate thumbnail
    - For larger images (multi-chunk): fetch and decrypt enough chunks to reconstruct the image, then generate thumbnail
    - Encrypt thumbnail with same FEK → upload to R2 at `/{userId}/thumbnails/{fileId}.webp`
    - Update file record: `has_thumbnail = true`, `thumbnail_r2_key = ...`

- [ ] **9.3 — Implement thumbnail API route**
  - File: `src/app/api/files/[id]/thumbnail/route.ts`
  - GET: auth check → get file → decrypt FEK → fetch encrypted thumbnail from R2 → decrypt → serve
  - Set `Cache-Control: private, max-age=3600` (browser-side caching)
  - Set `Content-Type: image/webp`

- [ ] **9.4 — Display thumbnails in file explorer**
  - Update `file-grid.tsx` and `file-list.tsx`:
    - If `has_thumbnail`: load from `/api/files/{id}/thumbnail`
    - If no thumbnail: show generic icon based on MIME type (document, audio, video, etc.)
  - Use `<img loading="lazy">` for performance

---

## Deliverables

| Output                  | Location                                    |
| ----------------------- | ------------------------------------------- |
| Thumbnail generator     | `src/lib/storage/thumbnail.ts`              |
| Thumbnail API           | `src/app/api/files/[id]/thumbnail/route.ts` |
| Updated upload complete | Thumbnail generation integrated             |
| Updated file explorer   | Shows thumbnails/icons                      |

---

## Testing

### Automated (Vitest)

```bash
npx vitest run tests/thumbnail
```

| Test                                | Expected                   |
| ----------------------------------- | -------------------------- |
| Generate thumbnail from JPEG buffer | Returns WebP Buffer ≤ 50KB |
| Generate thumbnail from PNG         | Returns WebP Buffer        |
| Non-image file returns null         | Returns null               |
| Thumbnail ≤ 256x256 px              | Dimensions within bounds   |

### Manual Verification

1. Upload a JPEG image → verify thumbnail appears in file grid (not the generic icon)
2. Upload a PDF → verify generic document icon shown (no thumbnail crash)
3. Upload multiple images → verify all thumbnails load in grid without lag
4. Check R2 bucket → verify `/{userId}/thumbnails/{fileId}.webp` exists and is encrypted
