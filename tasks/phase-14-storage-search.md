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

- [ ] **14.4 - Implement semantic file search**
  - Route or server action: `semanticSearch(query, options)` - embeds the user query with `RETRIEVAL_QUERY`
  - Query `embedding_chunks` using MariaDB cosine vector search
  - Return grouped results by file with score and modality-aware reference metadata
  - PDFs should include snippet and page range when available; image results may omit reference text entirely
  - Keep this path additive; do not replace the existing full-text filename search

- [ ] **14.5 - Add semantic search mode to the dashboard UI**
  - Add a search mode toggle/tab: `Filename` (default) and `Semantic`
  - Show indexing status for eligible PDFs and images so users know whether a file is searchable semantically
  - Surface skipped states for unsupported files and PDFs over the 10MB indexing limit

---

## Testing

| Test                                                | Expected                        |
| --------------------------------------------------- | ------------------------------- |
| Upload 3 images + 2 PDFs -> storage shows breakdown | Correct types/sizes             |
| Quota bar reflects actual usage                     | Matches `storage_used`          |
| Quick filter "report" -> shows only matching files | Client filter works             |
| Full search "tax" -> returns matching files        | Server search works             |
| Semantic search "tax penalties" -> returns relevant files with modality-aware references | Vector search works |
| Filename search remains default                     | Existing search UX unchanged    |
