# Phase 10 — Trash & Soft Delete

> **Objective:** Implement trash view, restore from trash, permanent delete, and auto-cleanup cron.

**Depends on:** Phase 6 (File Management UI)  
**Blueprint ref:** Section 19 (Trash / Soft Delete)

---

## Tasks

- [ ] **10.1 — Update file service for trash operations**
  - Add to `file-service.ts`:
    - `listTrashed()` — `WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - 30 days`
    - `restore(fileId)` — clear `deleted_at`
    - `permanentDelete(fileId)` — delete R2 chunks + DB records, reclaim quota
    - `emptyTrash()` — permanent delete all trashed files

- [ ] **10.2 — Build trash page**
  - File: `src/app/(dashboard)/trash/page.tsx`
  - Lists soft-deleted files with: name, size, delete date, days remaining
  - Actions per file: Restore, Permanent Delete
  - "Empty Trash" button

- [ ] **10.3 — Add trash navigation**
  - Add "Trash" link to dashboard sidebar/nav
  - Badge showing number of trashed items

- [ ] **10.4 — Implement consolidated cleanup cron**
  - File: `src/app/api/cron/cleanup/route.ts`
  - Protected by `CRON_SECRET` header (reject if missing/mismatch)
  - **Trash auto-purge**: files with `deleted_at > 30 days ago` → delete R2 chunks, thumbnail, DB records (cascade `file_chunks`, `share_links`), reclaim `storage_used`
  - **Stale upload cleanup**: `upload_sessions` with status `initialized`/`uploading` created > 24h ago → delete R2 chunks, mark `expired`, reclaim quota
  - Configure in `vercel.json`:
    ```json
    { "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 */6 * * *" }] }
    ```

---

## Deliverables

| Output                           | Location                             |
| -------------------------------- | ------------------------------------ |
| Trash operations in file service | `src/lib/services/file-service.ts`   |
| Trash page                       | `src/app/(dashboard)/trash/page.tsx` |
| Cleanup cron                     | `src/app/api/cron/cleanup/route.ts`  |

---

## Testing

### Automated

| Test                                  | Expected                  |
| ------------------------------------- | ------------------------- |
| Delete file → `deleted_at` is set     | Soft delete works         |
| Deleted file excluded from `list()`   | Normal list omits trashed |
| `listTrashed()` returns deleted files | Trash query works         |
| `restore(fileId)` clears `deleted_at` | File visible again        |
| `permanentDelete()` removes R2 + DB   | Everything cleaned up     |

### Manual Verification

1. Delete a file → verify it disappears from file explorer
2. Go to Trash → verify file visible with "Restore" button
3. Click Restore → verify file reappears in file explorer
4. Delete a file again → click "Permanent Delete" → verify gone from trash
5. Verify storage usage decreases after permanent delete
