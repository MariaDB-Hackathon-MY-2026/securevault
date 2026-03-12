# Phase 14 - Storage Dashboard & Search

> **Objective:** Show storage usage breakdown and implement file search.

**Depends on:** Phase 6 (File Management UI)  
**Blueprint ref:** Section 19 (Storage Dashboard, Search & Filter)

---

## Tasks

- [ ] **14.1 - Build storage usage dashboard**
  - File: `src/app/(dashboard)/settings/storage/page.tsx` (or section in settings)
  - Progress bar: used / 1GB quota
  - Breakdown by file type (images, docs, videos, etc.)
  - "Largest files" list for cleanup

- [ ] **14.2 - Implement quick filter**
  - Client-side filter in file explorer toolbar
  - Filter by filename substring (instant, no API call)

- [ ] **14.3 - Implement full-text search**
  - Server action: `searchFiles(query)` - uses MariaDB `LIKE` or `FULLTEXT` on `files.name`
  - Search results page or dropdown

- [ ] **14.4 - Implement semantic PDF search**
  - Route or server action: `semanticSearch(query, options)` - embeds the user query with `RETRIEVAL_QUERY`
  - Query `pdf_embedding_chunks` using MariaDB cosine vector search
  - Return grouped results by file with score, snippet, and page range metadata
  - Keep this path additive; do not replace the existing full-text filename search

- [ ] **14.5 - Add semantic search mode to the dashboard UI**
  - Add a search mode toggle/tab: `Filename` (default) and `Semantic PDF`
  - Show indexing status for eligible PDFs so users know whether a document is searchable semantically
  - Surface skipped states for non-PDF files and PDFs over the 10MB indexing limit

---

## Testing

| Test                                                | Expected                        |
| --------------------------------------------------- | ------------------------------- |
| Upload 3 images + 2 PDFs -> storage shows breakdown | Correct types/sizes             |
| Quota bar reflects actual usage                     | Matches `storage_used`          |
| Quick filter "report" -> shows only matching files | Client filter works             |
| Full search "tax" -> returns matching files        | Server search works             |
| Semantic search "tax penalties" -> returns relevant PDF chunks | Vector search works |
| Filename search remains default                     | Existing search UX unchanged    |
