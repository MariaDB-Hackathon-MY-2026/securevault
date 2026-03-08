# Phase 14 — Storage Dashboard & Search

> **Objective:** Show storage usage breakdown and implement file search.

**Depends on:** Phase 6 (File Management UI)  
**Blueprint ref:** Section 19 (Storage Dashboard, Search & Filter)

---

## Tasks

- [ ] **14.1 — Build storage usage dashboard**
  - File: `src/app/(dashboard)/settings/storage/page.tsx` (or section in settings)
  - Progress bar: used / 1GB quota
  - Breakdown by file type (images, docs, videos, etc.)
  - "Largest files" list for cleanup

- [ ] **14.2 — Implement quick filter**
  - Client-side filter in file explorer toolbar
  - Filter by filename substring (instant, no API call)

- [ ] **14.3 — Implement full-text search**
  - Server action: `searchFiles(query)` — uses MariaDB `LIKE` or `FULLTEXT` on `files.name`
  - Search results page or dropdown

---

## Testing

| Test                                               | Expected               |
| -------------------------------------------------- | ---------------------- |
| Upload 3 images + 2 PDFs → storage shows breakdown | Correct types/sizes    |
| Quota bar reflects actual usage                    | Matches `storage_used` |
| Quick filter "report" → shows only matching files  | Client filter works    |
| Full search "tax" → returns matching files         | Server search works    |
