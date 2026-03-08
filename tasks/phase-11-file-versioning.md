# Phase 11 — File Versioning _(Stretch Goal)_

> **Objective:** Allow re-uploading new versions of a file while preserving history. Last 5 versions.

> [!NOTE]
> **Not in MVP scope.** Only implement if time permits after all core features are stable.

**Depends on:** Phase 5 (Download)  
**Blueprint ref:** Section 19 (Version History)

---

## Tasks

- [ ] **11.1 — Implement version service**
  - File: `src/lib/services/version-service.ts`
  - `uploadNewVersion(fileId, file)` — creates `file_versions` record, new FEK, new chunks
  - `listVersions(fileId)` — returns all versions ordered by version_number DESC
  - `downloadVersion(fileId, versionId)` — stream specific version
  - `restoreVersion(fileId, versionId)` — promotes old version to current
  - Auto-delete oldest when > 5 versions
  - All versions count toward user storage quota

- [ ] **11.2 — Build "Upload New Version" UI**
  - Add "Upload New Version" option to file context menu
  - Uses same upload flow but creates a `file_versions` entry instead of a new `files` row

- [ ] **11.3 — Build version history panel**
  - File: `src/components/file-explorer/version-history.tsx`
  - Shows: version number, date, size
  - Actions per version: Download, Restore
  - Accessible from file context menu → "Version History"

---

## Deliverables

| Output                | Location                                           |
| --------------------- | -------------------------------------------------- |
| Version service       | `src/lib/services/version-service.ts`              |
| Version history panel | `src/components/file-explorer/version-history.tsx` |

---

## Testing

### Manual Verification

1. Upload "report.pdf" → upload a new version → verify version history shows v1 and v2
2. Download v1 → verify it's the original content
3. Restore v1 → verify the file preview shows v1 content
4. Upload 6 versions → verify only last 5 remain (v1 auto-deleted)
5. Verify storage_used reflects all version sizes
