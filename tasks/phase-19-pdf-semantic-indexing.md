# Phase 19 - PDF Semantic Indexing & Search

> **Objective:** Add a post-upload, PDF-only semantic indexing pipeline that stays separate from the encrypted upload critical path.

**Depends on:** Phase 1 (DB), Phase 4 (Upload), Phase 5 (Download), Phase 14 (Storage & Search)  
**Blueprint ref:** Sections 3 (Upload Flow), 7 (AI Agent), 8 (Schema), 19 (Search & Filter)

> [!NOTE]
> This is an additive enhancement. Upload, download, preview, and filename/full-text search must continue to work exactly as before even if semantic indexing fails.

---

## Tasks

- [ ] **19.1 - Install PDF semantic indexing dependencies and config**
  - `npm install ai @ai-sdk/google pdfjs-dist`
  - Add env vars: `GOOGLE_GENERATIVE_AI_API_KEY`, `PDF_EMBEDDING_MAX_BYTES`, `PDF_EMBEDDING_MODEL`, `PDF_EMBEDDING_DIMENSIONS`, `PDF_OCR_PROVIDER`
  - Defaults:
    - `PDF_EMBEDDING_MAX_BYTES=10485760`
    - `PDF_EMBEDDING_MODEL=gemini-embedding-2-preview`
    - `PDF_EMBEDDING_DIMENSIONS=1536`
    - `PDF_OCR_PROVIDER=gemini-vision`

- [ ] **19.2 - Add MariaDB schema for PDF embedding jobs and chunks**
  - Files: `src/lib/db/schema/pdf-embedding-jobs.ts`, `src/lib/db/schema/pdf-embedding-chunks.ts`
  - `pdf_embedding_jobs`: one job per file with `queued/processing/ready/skipped/failed` lifecycle
  - `pdf_embedding_chunks`: one row per searchable chunk with encrypted text + `VECTOR(1536)`
  - Add cosine vector index and user/file-scoped relational indexes

- [ ] **19.3 - Build the indexing start/status APIs**
  - Route: `src/app/api/embeddings/pdf/route.ts` for `POST /api/embeddings/pdf`
  - Route: `src/app/api/embeddings/pdf/[fileId]/route.ts` for status reads
  - Validate auth, ownership, `files.status === 'ready'`, `mime_type === 'application/pdf'`, and `size <= 10MB`
  - Make the start route idempotent: return an existing queued/processing/ready job instead of creating duplicate work

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

- [ ] **19.6 - Implement chunking, embedding, and encrypted text persistence**
  - Split extracted text into semantic chunks with page range metadata
  - Embed chunks with `google.embedding('gemini-embedding-2-preview')`
  - Use `RETRIEVAL_DOCUMENT` for stored chunks and `outputDimensionality: 1536`
  - Encrypt extracted chunk text at rest with an FEK-derived key before writing to MariaDB

- [ ] **19.7 - Trigger indexing after upload completion**
  - Update `useUpload` so the browser calls `POST /api/embeddings/pdf` only after `/api/upload/complete` succeeds
  - Skip trigger for non-PDF files and PDFs larger than 10MB
  - Surface indexing status as additive UI feedback, never as upload failure

- [ ] **19.8 - Add semantic PDF search API and UI integration**
  - Route or server action: `POST /api/search/semantic`
  - Embed user queries with `RETRIEVAL_QUERY`
  - Search `pdf_embedding_chunks` via MariaDB cosine vector search
  - Add a dashboard search mode toggle: `Filename` (default) and `Semantic PDF`
  - Show file name, score, snippet, and page range in results

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

| Output                     | Location                                       |
| -------------------------- | ---------------------------------------------- |
| Embedding start API        | `src/app/api/embeddings/pdf/route.ts`          |
| Embedding status API       | `src/app/api/embeddings/pdf/[fileId]/route.ts` |
| Semantic search API        | `src/app/api/search/semantic/route.ts`         |
| PDF text extractor         | `src/lib/ai/embeddings/pdf-text-extractor.ts`  |
| OCR provider contracts     | `src/lib/ai/ocr/*.ts`                          |
| Vector schema              | `src/lib/db/schema/pdf-embedding-*.ts`         |
| Search mode UI             | `src/components/file-explorer/*`               |

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
| Non-PDF upload does not create indexing job           | No semantic indexing request                         |
| Native text PDF indexes without OCR                   | Native extractor path succeeds                       |
| Scanned PDF falls back to OCR                         | OCR provider invoked and searchable chunks persisted |
| Re-triggering same file does not duplicate chunk rows | Idempotent job reuse                                 |
| Query embedding uses `RETRIEVAL_QUERY`                | Semantic search contract honored                     |
| Semantic search only returns current user's files     | Auth scoping preserved                               |

### Manual Verification (Browser)

1. Upload a PDF under 10MB - verify it becomes available immediately and later shows semantic indexing ready
2. Upload a PDF over 10MB - verify upload succeeds and semantic status shows skipped
3. Upload a JPG - verify no semantic indexing status appears
4. Run filename search - verify existing results still work
5. Switch to `Semantic PDF` mode and search natural-language content - verify relevant PDFs appear with snippets/page ranges
6. Force an OCR or embedding failure - verify download/preview/share still work for the file
