# Phase 6 — File Management UI

> **Objective:** Build the file explorer with grid/list views, rename, move, bulk operations, and the scoped service layer.

**Depends on:** Phase 4 (Upload), Phase 5 (Download)  
**Blueprint ref:** Sections 19 (UX Essentials), 20 (API Scoping)

---

## Tasks

- [ ] **6.1 — Implement scoped file service**
  - File: `src/lib/services/file-service.ts`
  - `createFileService(userId: string)` per Section 20
  - Methods: `list(folderId?)`, `getById(fileId)`, `rename(fileId, newName)`, `move(fileId, folderId)`, `delete(fileId)` (soft delete), `getStorageUsage()`
  - ALL queries scoped by `userId` — IDOR protection

- [ ] **6.2 — Build file list server action**
  - File: `src/app/(dashboard)/files/actions.ts`
  - `getFiles(folderId?: string)` — returns files + folders for current user in current folder
  - Uses `createFileService(userId)` from session

- [ ] **6.3 — Build file explorer component (grid view)**
  - File: `src/components/file-explorer/file-grid.tsx`
  - Displays file cards with: thumbnail/icon, filename, size, date
  - Click → open preview modal or navigate into folder
  - Right-click / kebab menu → rename, move, share, download, delete

- [ ] **6.4 — Build file explorer component (list view)**
  - File: `src/components/file-explorer/file-list.tsx`
  - Table layout: checkbox, icon, name, size, modified date, actions
  - Sortable columns

- [ ] **6.5 — Build view toggle + toolbar**
  - File: `src/components/file-explorer/toolbar.tsx`
  - Grid/List toggle, Sort dropdown, Upload button, New folder button
  - Client-side quick filter by name

- [ ] **6.6 — Implement file rename**
  - Inline rename (click filename → editable input → save on Enter/blur)
  - Server action: `renameFile(fileId, newName)` → uses `sanitizeFilename`

- [ ] **6.7 — Implement file move**
  - Move dialog: shows folder tree, user selects destination
  - Server action: `moveFile(fileId, targetFolderId)`

- [ ] **6.8 — Implement bulk selection & actions**
  - Checkbox selection (click or Ctrl+click)
  - Bulk actions bar: Delete, Move, Share
  - Server action: `bulkDelete(fileIds[])`, `bulkMove(fileIds[], folderId)`, `bulkShare(fileIds[])`
  - _(Bulk download as ZIP is not in MVP scope)_

- [ ] **6.9 — Build files page**
  - File: `src/app/(dashboard)/files/page.tsx`
  - Composes toolbar + file grid/list + upload dialog
  - Breadcrumb navigation for nested folders

- [ ] **6.10 — Set up TanStack Query for files**
  - File: `src/hooks/use-files.ts`
  - `useFiles(folderId?)` — fetches file list, caches, invalidates on upload/delete/rename
  - Optimistic updates for rename and delete

- [ ] **6.11 — Mobile responsiveness**
  - File grid → single column on mobile, 2-col on tablet
  - Dashboard sidebar → collapsible hamburger menu on mobile
  - Upload dialog → full-screen modal on mobile
  - Touch-friendly: min 44px tap targets, adequate spacing

- [ ] **6.12 — Add confirmation dialogs and toast feedback**
  - Confirmation `alert-dialog` for: delete file, bulk delete, empty trash
  - Toast notification for: upload complete, file renamed, file moved, link copied, error messages
  - Integrate shadcn `toast` and `alert-dialog` throughout file management actions
  - Touch-friendly: min 44px tap targets, adequate spacing

---

## Deliverables

| Output                | Location                                     |
| --------------------- | -------------------------------------------- |
| File service (scoped) | `src/lib/services/file-service.ts`           |
| File grid view        | `src/components/file-explorer/file-grid.tsx` |
| File list view        | `src/components/file-explorer/file-list.tsx` |
| Toolbar               | `src/components/file-explorer/toolbar.tsx`   |
| Files page            | `src/app/(dashboard)/files/page.tsx`         |
| Files hook            | `src/hooks/use-files.ts`                     |

---

## Testing

### Automated (Vitest) — `tests/services/`

```bash
npx vitest run tests/services
```

| Test                                           | Expected                |
| ---------------------------------------------- | ----------------------- |
| `fileService.list()` returns only user's files | Scoped correctly        |
| `fileService.getById(otherUsersFile)`          | Throws "File not found" |
| `fileService.delete(fileId)` sets `deleted_at` | Soft-deletes correctly  |
| `fileService.rename(fileId, name)` sanitizes   | Name cleaned            |

### Manual Verification (Browser)

1. Log in → see empty file explorer → upload a file → verify it appears
2. Toggle grid/list view → verify layout changes
3. Right-click file → Rename → verify new name persists on refresh
4. Select multiple files → click Delete → verify moved to trash (disappear from view)
5. Create user B → verify user B cannot see user A's files
