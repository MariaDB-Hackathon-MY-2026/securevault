# Phase 19 - Semantic Indexing & Search

> **Objective:** Add a post-upload semantic indexing pipeline that stays separate from the encrypted upload critical path and supports multiple file modalities.

**Depends on:** Phase 1 (DB), Phase 4 (Upload), Phase 5 (Download), Phase 14 (Storage & Search)  
**Blueprint ref:** Sections 3 (Upload Flow), 7 (AI Agent), 8 (Schema), 19 (Search & Filter)

> [!NOTE]
> This is an additive enhancement. Upload, download, preview, and filename/full-text search must continue to work exactly as before even if semantic indexing fails.

---

## Tasks

- [ ] **19.1 - Install semantic indexing dependencies and config**
  - `npm install ai @ai-sdk/google pdfjs-dist`
  - Add env vars: `GOOGLE_GENERATIVE_AI_API_KEY`, `PDF_EMBEDDING_MAX_BYTES`, `PDF_EMBEDDING_MODEL`, `PDF_EMBEDDING_DIMENSIONS`, `PDF_OCR_PROVIDER`, `IMAGE_EMBEDDING_MODEL`, `IMAGE_EMBEDDING_DIMENSIONS`
  - Defaults:
    - `PDF_EMBEDDING_MAX_BYTES=10485760`
    - `PDF_EMBEDDING_MODEL=gemini-embedding-2-preview`
    - `PDF_EMBEDDING_DIMENSIONS=1536`
    - `PDF_OCR_PROVIDER=gemini-vision`
    - `IMAGE_EMBEDDING_MODEL=gemini-embedding-2-preview`
    - `IMAGE_EMBEDDING_DIMENSIONS=1536`

- [ ] **19.2 - Add MariaDB schema for generalized embedding jobs and chunks**
  - Files: `src/lib/db/schema/embedding-jobs.ts`, `src/lib/db/schema/embedding-chunks.ts`
  - `embedding_jobs`: one job per file + modality with `queued/processing/ready/skipped/failed` lifecycle
  - `embedding_chunks`: one row per searchable embedding with optional encrypted reference text + `VECTOR(1536)`
  - Add cosine vector index and user/file-scoped relational indexes

- [ ] **19.3 - Build the indexing start/status APIs**
  - Route: `src/app/api/embeddings/route.ts` for `POST /api/embeddings`
  - Route: `src/app/api/embeddings/[fileId]/route.ts` for status reads
  - Validate auth, ownership, `files.status === 'ready'`, and modality-specific eligibility
  - PDFs must satisfy `mime_type === 'application/pdf'` and `size <= 10MB`
  - Images should validate against the supported MIME allowlist
  - Make the start route idempotent: return an existing queued/processing/ready job instead of creating duplicate work for the same file + modality

- [ ] **19.4 - Implement native PDF text extraction**
  - File: `src/lib/ai/embeddings/pdf-text-extractor.ts`
  - Use `pdfjs-dist` to read decrypted PDF bytes
  - Extract text page-by-page before attempting OCR
  - Define a text coverage threshold that triggers OCR fallback only when native extraction is sparse

- [ ] **19.5 - Define pluggable OCR contracts**
  - Files: `src/lib/ai/ocr/types.ts`, `src/lib/ai/ocr/gemini-vision-ocr.ts`, `src/lib/ai/ocr/generic-ocr.ts`
  - Interface: `PdfOcrProvider` with `mode: 'vision' | 'generic'`
  - Default implementation: `GeminiVisionOcrProvider`
  - Secondary adapter: `GenericOcrProvider` contract for swapping in another OCR engine later

- [ ] **19.6 - Implement modality-aware embedding persistence**
  - PDFs: split extracted text into semantic chunks with page range metadata
  - Images: create one or more embeddings per asset without requiring text chunks
  - Embed stored items with `google.embedding('gemini-embedding-2-preview')`
  - Use `RETRIEVAL_DOCUMENT` for stored items and `outputDimensionality: 1536`
  - Encrypt extracted reference text at rest with an FEK-derived key before writing to MariaDB when that text exists

- [ ] **19.7 - Trigger indexing after upload completion**
  - Update `useUpload` so the browser calls `POST /api/embeddings` only after `/api/upload/complete` succeeds
  - Skip trigger for unsupported files and PDFs larger than 10MB
  - Surface indexing status as additive UI feedback, never as upload failure

- [ ] **19.8 - Add semantic search API and UI integration**
  - Route or server action: `POST /api/search/semantic`
  - Embed user queries with `RETRIEVAL_QUERY`
  - Search `embedding_chunks` via MariaDB cosine vector search
  - Add a dashboard search mode toggle: `Filename` (default) and `Semantic`
  - Show file name, score, and modality-aware references in results

- [ ] **19.9 - Add retry and failure handling**
  - Preserve `failed` and `skipped` job states with human-readable reason codes
  - Allow safe re-triggering without duplicate chunk rows
  - Ensure provider failures do not affect normal file operations

- [ ] **19.10 - Expose retrieval reuse hooks for the future AI agent**
  - Export shared semantic retrieval helpers from `src/lib/search/semantic/`
  - Make Phase 16 consume the same retrieval service for PDF questions
  - Keep chat retrieval additive; do not let it bypass existing auth-scoped search services

---

## Deliverables

| Output                     | Location                                   |
| -------------------------- | ------------------------------------------ |
| Embedding start API        | `src/app/api/embeddings/route.ts`          |
| Embedding status API       | `src/app/api/embeddings/[fileId]/route.ts` |
| Semantic search API        | `src/app/api/search/semantic/route.ts`     |
| PDF text extractor         | `src/lib/ai/embeddings/pdf-text-extractor.ts` |
| OCR provider contracts     | `src/lib/ai/ocr/*.ts`                      |
| Vector schema              | `src/lib/db/schema/embedding-*.ts`         |
| Search mode UI             | `src/components/file-explorer/*`           |

---

## Testing

### Automated (Vitest)

```bash
npx vitest run tests/semantic-search
```

| Test                                                  | Expected                                             |
| ----------------------------------------------------- | ---------------------------------------------------- |
| PDF under 10MB starts indexing after upload completes | Separate job created; upload remains `ready`         |
| PDF over 10MB is skipped                              | Upload succeeds; embedding job status is `skipped`   |
| Eligible image upload starts indexing                 | Separate job created with optional reference payload |
| Unsupported file upload does not create indexing job  | No semantic indexing request                         |
| Native text PDF indexes without OCR                   | Native extractor path succeeds                       |
| Scanned PDF falls back to OCR                         | OCR provider invoked and searchable chunks persisted |
| Re-triggering same file/modality does not duplicate chunk rows | Idempotent job reuse                         |
| Query embedding uses `RETRIEVAL_QUERY`                | Semantic search contract honored                     |
| Semantic search only returns current user's files     | Auth scoping preserved                               |

### Manual Verification (Browser)

1. Upload a PDF under 10MB - verify it becomes available immediately and later shows semantic indexing ready
2. Upload a PDF over 10MB - verify upload succeeds and semantic status shows skipped
3. Upload an eligible JPG or PNG - verify semantic indexing runs without requiring stored text chunks
4. Run filename search - verify existing results still work
5. Switch to `Semantic` mode and search natural-language content - verify relevant files appear with modality-aware references
6. Force an OCR or embedding failure - verify download/preview/share still work for the file
