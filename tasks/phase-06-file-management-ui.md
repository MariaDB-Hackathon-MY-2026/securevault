# Phase 6 — File Management UI

> **Objective:** Build the file explorer with grid/list views, rename, move, bulk operations, and the scoped service layer.

**Depends on:** Phase 4 (Upload), Phase 5 (Download)  
**Blueprint ref:** Sections 19 (UX Essentials), 20 (API Scoping)

---

## Codebase Context

> Key decisions already made by earlier phases that affect this phase:

- **File listing** uses a REST API + TanStack Query pattern, not Server Actions. `GET /api/files` → `src/lib/files/files-query.ts` → `src/hooks/use-files-query.ts`. The hook already exists and supports `initialData` from SSR.
- **File service** lives at `src/app/api/files/service.ts` — co-located with its API routes. `listReadyFilesForUser(userId)` already exists there as a plain function with `userId` as the first param. All new methods follow the same pattern and go in this same file.
- **All file components** live under `src/components/files/` (not `file-explorer/`). `files-library.tsx` is the current basic list — it will be replaced/extended by tasks 6.3–6.5.
- **Files page** (`src/app/(dashboard)/files/page.tsx`) and its content shell (`src/components/files/files-page-content.tsx`) already exist. The upload dialog is already composed in there.
- **Toast system** uses `sonner`. Use `import { toast } from "sonner"` or the existing `useActionToast` hook (`src/hooks/use-action-toast.ts`). Do NOT use `@/components/ui/toast`.
- **`alert-dialog`** shadcn component is already installed at `src/components/ui/alert-dialog.tsx`.
- **`sanitizeFilename`** is exported from `src/lib/crypto` — reuse it for rename validation.
- **Database** — `files` table has `folder_id` FK and `deleted_at` for soft deletes. `folders` table has `parent_id` for nesting. Both are ready.

---

## Tasks

- [ ] **6.1 — Extend scoped file service**
  - File: `src/app/api/files/service.ts` _(already exists — add new exports to it)_
  - Add plain functions, each taking `userId` as the first param — same style as existing `listReadyFilesForUser(userId)`
  - Add: `getFileById(userId, fileId)`, `renameFile(userId, fileId, newName)`, `moveFile(userId, fileId, targetFolderId)`, `softDeleteFile(userId, fileId)`, `bulkSoftDelete(userId, fileIds[])`, `bulkMoveFiles(userId, fileIds[], targetFolderId)`, `getStorageUsage(userId)`
  - ALL queries must filter by `userId` — IDOR protection
  - `renameFile` must call `sanitizeFilename` from `src/lib/crypto`

- [ ] **6.2 — Build file mutation server actions**
  - File: `src/app/(dashboard)/files/actions.ts` _(new file — listing already handled by `/api/files` REST route)_
  - Each action calls `requireCurrentUser()` then imports and calls the relevant function from `src/app/api/files/service.ts` directly
  - `renameFileAction(fileId, newName)` → `renameFile(user.id, fileId, newName)`
  - `moveFileAction(fileId, targetFolderId)` → `moveFile(user.id, fileId, targetFolderId)`
  - `deleteFileAction(fileId)` → `softDeleteFile(user.id, fileId)`
  - `bulkDeleteAction(fileIds[])` → `bulkSoftDelete(user.id, fileIds)`
  - `bulkMoveAction(fileIds[], folderId)` → `bulkMoveFiles(user.id, fileIds, folderId)`
  - All actions call `revalidatePath("/files")` after mutation

- [ ] **6.3 — Build file explorer component (grid view)**
  - File: `src/components/files/file-grid.tsx`
  - Displays file cards with: thumbnail/icon, filename, size, date
  - Click → open preview modal or navigate into folder
  - Kebab menu per card → rename, move, download, delete (share deferred to Phase 7)

- [ ] **6.4 — Build file explorer component (list view)**
  - File: `src/components/files/file-list.tsx`
  - Table layout: checkbox, icon, name, size, modified date, actions column
  - Sortable columns (client-side)
  - Replaces the existing basic list in `files-library.tsx`

- [ ] **6.5 — Build view toggle + toolbar**
  - File: `src/components/files/toolbar.tsx`
  - Grid/List toggle, Sort dropdown, New folder button
  - Upload button → reuses existing `<UploadDialog />` from `src/components/upload/upload-dialog.tsx`
  - Client-side quick filter by name

- [ ] **6.6 — Implement file rename**
  - Inline rename: click filename → editable `<input>` → save on Enter / cancel on Escape / blur
  - Calls `renameFileAction` from 6.2
  - On success: toast via `sonner`; on error: toast error
  - After save: invalidate `filesQueryKey` via TanStack Query client

- [ ] **6.7 — Implement file move**
  - Move dialog: shows folder tree (query `folders` table scoped by userId), user selects destination
  - Calls `moveFileAction` from 6.2
  - After move: invalidate `filesQueryKey`

- [ ] **6.8 — Implement bulk selection & actions**
  - Checkbox selection in list view (click or Ctrl+click)
  - Bulk actions bar appears when ≥1 file selected: Delete, Move
  - _(Bulk Share deferred to Phase 7 — sharing infrastructure not yet exposed in UI)_
  - _(Bulk download as ZIP is not in MVP scope)_
  - Calls `bulkDeleteAction` / `bulkMoveAction` from 6.2
  - After action: invalidate `filesQueryKey`

- [ ] **6.9 — Update files page**
  - Files: `src/app/(dashboard)/files/page.tsx` + `src/components/files/files-page-content.tsx` _(both exist, update to compose new components)_
  - Replace `<FilesLibrary>` with `<Toolbar>` + `<FileGrid>` / `<FileList>` (view-toggle driven)
  - Add breadcrumb navigation for nested folders

- [ ] **6.10 — Wire TanStack Query cache invalidation**
  - Hook already exists: `src/hooks/use-files-query.ts` (`useFilesQuery`)
  - Wire `queryClient.invalidateQueries({ queryKey: filesQueryKey })` after:
    - Upload completes (in upload provider / queue)
    - Any mutation action (rename, move, delete, bulk ops) succeeds
  - Add optimistic update for rename (update name in cache before server confirms)

- [ ] **6.11 — Mobile responsiveness**
  - File grid → single column on mobile, 2-col on tablet
  - Dashboard sidebar → collapsible hamburger menu on mobile
  - Upload dialog → full-screen modal on mobile (already uses `<Dialog>` — verify `sm:max-w` behavior)
  - Touch-friendly: min 44px tap targets, adequate spacing

- [ ] **6.12 — Add confirmation dialogs and toast feedback**
  - Confirmation `<AlertDialog>` (from `src/components/ui/alert-dialog.tsx`) for: delete file, bulk delete
  - Toast notifications via `sonner` (or `useActionToast` hook) for: file renamed, file moved, file deleted, error messages
  - Upload complete toast is handled by the upload queue — verify it fires correctly after this phase's changes

---

## Deliverables

| Output                    | Location                                          | Status       |
| ------------------------- | ------------------------------------------------- | ------------ |
| File service (scoped)     | `src/app/api/files/service.ts`                    | ⚠️ Exists, add new functions |
| File mutation actions      | `src/app/(dashboard)/files/actions.ts`            | ❌ New        |
| File grid view            | `src/components/files/file-grid.tsx`              | ❌ New        |
| File list view            | `src/components/files/file-list.tsx`              | ❌ New        |
| Toolbar                   | `src/components/files/toolbar.tsx`                | ❌ New        |
| Files page (update)       | `src/app/(dashboard)/files/page.tsx`              | ⚠️ Exists, update |
| Files page content (update) | `src/components/files/files-page-content.tsx`   | ⚠️ Exists, update |
| Files query hook (update) | `src/hooks/use-files-query.ts`                    | ⚠️ Exists, wire invalidation |

---

## Testing

### Automated (Vitest) — `tests/services/`

```bash
npx vitest run tests/services
```

| Test                                                           | Expected                         |
| -------------------------------------------------------------- | -------------------------------- |
| `getFileById(userId, otherUsersFileId)` returns null           | Scoped correctly (IDOR blocked)  |
| `softDeleteFile(userId, fileId)` sets `deleted_at`             | Soft-deletes correctly           |
| `renameFile(userId, fileId, name)` sanitizes filename          | Name cleaned                     |
| `bulkSoftDelete(userId, [id1, id2])` only deletes caller's files | Only user's files affected     |

### Manual Verification (Browser)

1. Log in → see empty file explorer → upload a file → verify it appears without page refresh
2. Toggle grid/list view → verify layout changes
3. Click filename → rename inline → verify new name persists on refresh
4. Right-click / kebab → Delete → confirm dialog appears → confirm → file disappears
5. Select multiple files → bulk delete → all disappear from view
6. Create user B → verify user B cannot see user A's files
