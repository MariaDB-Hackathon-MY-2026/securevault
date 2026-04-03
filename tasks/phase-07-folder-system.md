# Phase 7 — Folder System

> **Objective:** Complete folder CRUD, rename/delete, folder-to-folder moves, and a confirmed delete dialog for folders.

**Depends on:** Phase 6 (File Management UI)  
**Blueprint ref:** Sections 8 (Schema: folders), 15 (Folder Sharing)

---

## Implementation Status vs Codebase Reality

Audited on **2026-04-02** against `secure-vault/`.

### ✅ Already Implemented

| Feature | Location |
|---|---|
| `folders` DB schema with `parent_id`, `deleted_at`, self-referential FK | `src/lib/db/schema/folders.ts` |
| `files` schema references `folder_id` with indexes | `src/lib/db/schema/files.ts` |
| `listFoldersForUser()` | `src/app/api/files/service.ts` |
| `createFolder()` — name sanitization + parent ownership guard | `src/app/api/files/service.ts` |
| `assertFolderOwnership()` utility to prevent cross-user access | `src/app/api/files/service.ts` |
| `moveFile()` + `bulkMoveFiles()` with folder ownership guard | `src/app/api/files/service.ts` |
| `softDeleteFile()` + `bulkSoftDelete()` | `src/app/api/files/service.ts` |
| `createFolderAction()` server action | `src/app/(dashboard)/files/actions.ts` |
| `moveFileAction()` + `bulkMoveAction()` server actions | `src/app/(dashboard)/files/actions.ts` |
| `deleteFileAction()` + `bulkDeleteAction()` server actions | `src/app/(dashboard)/files/actions.ts` |
| `CreateFolderDialog` component | `src/components/files/create-folder-dialog.tsx` |
| `FilesBreadcrumbs` component | `src/components/files/files-breadcrumbs.tsx` |
| `getFolderPath()` — breadcrumb chain with cycle guard | `src/components/files/file-browser-utils.ts` |
| `FileGrid` + `FileList` — folders before files, click navigates | `src/components/files/file-grid.tsx`, `file-list.tsx` |
| `FilesLibrary` — orchestrates navigation, create dialog, move dialog | `src/components/files/files-library.tsx` |
| `MoveFilesDialog` — hierarchical folder picker with `getFolderDepth` indentation | `src/components/files/move-files-dialog.tsx` |
| `/files` page fetches folders server-side | `src/app/(dashboard)/files/page.tsx` |
| Vitest unit tests: `createFolder`, parent ownership guard, file move/delete | `tests/services/file-service.test.ts` |
| Vitest integration tests: `FilesLibrary` create-folder, move, delete, rename | `tests/files/files-library.test.tsx` |
| Vitest utils tests: `getFolderPath` including cycle-guard | `tests/files/file-browser-utils.test.ts` |
| Playwright E2E: folder create, file rename, move, delete, bulk ops | `tests/e2e/file-actions.spec.ts` |

> **Architectural note:** The planned `src/lib/services/folder-service.ts` was intentionally not created — folder logic lives in `src/app/api/files/service.ts`. Components landed in `src/components/files/` not `file-explorer/`. Both deviations are consistent.

---

## Remaining Tasks

### 7.1 — Folder rename

> **Status:** ❌ Not implemented

- [ ] Add `renameFolder(userId, folderId, newName)` to `src/app/api/files/service.ts`
  - Sanitize name via `sanitizeFilename()`
  - Scope: `user_id` matches AND `deleted_at IS NULL`
  - Return updated `FolderListItem`
- [ ] Add `renameFolderAction(folderId, newName)` to `src/app/(dashboard)/files/actions.ts`
  - Validate: non-empty string, max 255 chars
  - Call `requireCurrentUser()` then `renameFolder()`
  - `revalidatePath("/files")`
- [ ] Add rename entry point in `FileList` folder rows (currently shows static "Open" in actions column)
- [ ] Add rename entry point in `FileGrid` folder cards (no actions at all currently)
- [ ] Optimistically update `folders` state in `FilesLibrary` on rename

### 7.2 — Folder delete (soft + UI)

> **Status:** ❌ Not implemented

- [ ] Add `softDeleteFolder(userId, folderId)` to `src/app/api/files/service.ts`
  - Soft-delete the target folder: `SET deleted_at = NOW()` scoped to user
  - Recursively collect all descendant folder IDs (iterative BFS/DFS over in-memory `folderList` — avoids recursive SQL incompatibility with MariaDB 10.x without CTEs)
  - Soft-delete all files with `folder_id IN (descendantIds)` in a single batched update
  - Return `{ deletedFolders: number; deletedFiles: number }`
- [ ] Add `deleteFolderAction(folderId)` to `src/app/(dashboard)/files/actions.ts`
  - Validate folderId, call `requireCurrentUser()`, delegate to `softDeleteFolder()`
  - `revalidatePath("/files")`
- [ ] Add `DeleteFolderDialog` or extend `DeleteFilesDialog` to show the count copy:  
  *"This will permanently delete N files and M sub-folders."*
- [ ] Wire delete button into `FileGrid` folder cards and `FileList` folder rows
- [ ] Optimistically remove the folder + descendants from local `folders` state in `FilesLibrary`

### 7.3 — Folder-to-folder move  

> **Status:** ❌ Not implemented

- [ ] Add `moveFolder(userId, folderId, targetParentId)` to `src/app/api/files/service.ts`
  - If `targetParentId` is non-null: call `assertFolderOwnership()`
  - **Circular-move guard:** walk ancestor chain of `targetParentId`; throw if it equals or contains `folderId`
  - Update `parent_id` on the folder row
- [ ] Add `moveFolderAction(folderId, targetParentId)` to `src/app/(dashboard)/files/actions.ts`
- [ ] Extend `MoveFilesDialog` (or create `MoveFolderDialog`) to exclude the moved folder and its entire subtree from the destination list
- [ ] Wire move affordance into `FileGrid` folder cards and `FileList` folder rows

---

## Testing

Three test layers are used in this project: **Vitest unit/service tests**, **Vitest + React Testing Library component tests**, and **Playwright E2E tests**. All new folder features must be covered at every applicable layer.

### Run commands

```bash
# Unit/service layer
npx vitest run tests/services/folder-service
npx vitest run tests/services/file-service

# Utility layer
npx vitest run tests/files/file-browser-utils

# Component integration layer
npx vitest run tests/files/files-library

# E2E (requires running dev server + seeded DB)
npx playwright test tests/e2e/file-actions.spec.ts
```

---

### Layer 1 — Unit / Service Tests
**File:** `tests/services/folder-service.test.ts` *(new file)*

Use the same `createDbHarness` pattern established in `file-service.test.ts`. The harness mocks `MariadbConnection.getConnection()` and manages queued select/update/insert results.

#### `renameFolder`

| # | Test | Input | Expected |
|---|---|---|---|
| R-1 | Happy path — sanitizes name and returns updated folder | `"  ./My Docs?  "` | `name === "My Docs"`, update called with sanitized value |
| R-2 | No-op rename — folder already has that name | name equals the already-stored value | Resolves with existing record; update still fires (idempotent) |
| R-3 | Rejects rename for a folder owned by another user | `selectResults: [[]]` (no ownership row) | Throws `"Folder not found"`, no update issued |
| R-4 | Rejects rename for a soft-deleted folder | `deleted_at` set on the ownership check row | Throws `"Folder not found"` |
| R-5 | Name collapses to empty after sanitization | Input `"../???"` → `sanitizeFilename` → `""` | Throws validation error before any DB call |
| R-6 | Name exceeds 255 characters | 256-char string | Throws validation error before any DB call |

#### `softDeleteFolder`

| # | Test | Input | Expected |
|---|---|---|---|
| D-1 | Deletes a root folder with no children and no files | single-folder tree | Returns `{ deletedFolders: 1, deletedFiles: 0 }` |
| D-2 | Cascades to direct child folders | parent → child tree | Both folders get `deleted_at`; returns `{ deletedFolders: 2, deletedFiles: 0 }` |
| D-3 | Cascades recursively through 3-level tree | grandparent → parent → child | Returns `{ deletedFolders: 3, deletedFiles: 0 }` |
| D-4 | Soft-deletes all files within the deleted subtree | folder with 2 files | Returns `{ deletedFolders: 1, deletedFiles: 2 }` |
| D-5 | **Does not delete files in sibling folders** | sibling folders with files | Only files in the target subtree are touched |
| D-6 | Idempotent — folder already deleted | `deleted_at` already set on folder | Returns `{ deletedFolders: 0, deletedFiles: 0 }` without error |
| D-7 | Rejects delete for a folder outside the caller scope | `user_id` mismatch | Throws `"Folder not found"`, no updates issued |
| D-8 | **Ownership scoped per user** | two users, same folder ID value | Only the requesting user's folder is deleted |

> **Production concern — D-5:** The delete cascade must be bounded to the subtree rooted at `folderId`. A naive implementation that deletes all files for `user_id` with any `folder_id != null` would wipe files in unrelated folders. The recursive folder ID collection must happen before the file delete query.

#### `moveFolder`

| # | Test | Input | Expected |
|---|---|---|---|
| M-1 | Moves folder to a valid sibling destination | `targetParentId` owned by user | `parent_id` updated, `assertFolderOwnership` called once |
| M-2 | Moves folder to root (`null` parent) | `targetParentId = null` | `parent_id = null` set, no ownership check |
| M-3 | **Rejects direct self-move** | `moveFolder("user", "folder-A", "folder-A")` | Throws circular-reference error, no update |
| M-4 | **Rejects indirect circular move** | A→B→C, try to move A into C | Throws circular-reference error, no update |
| M-5 | Rejects move to a foreign folder | `assertFolderOwnership` → throws | Throws `"Folder not found"`, no update |
| M-6 | Rejects move of a deleted folder | folder's `user_id` check fails | Throws `"Folder not found"` |
| M-7 | **Single-level circular: A.parent=B, move B into A** | tree: B is parent of A | Throws circular-reference error |

> **Production concern — M-3/M-4:** If the circular-reference guard is missing, moving a folder into a descendant silently breaks the ancestor chain. `getFolderPath` already protects the UI from infinite loops via the `seen` set, but the guard must live in the service layer so the corrupt `parent_id` is never written to the DB.

---

### Layer 2 — Component Integration Tests (React Testing Library)
**File:** `tests/files/files-library.test.tsx` *(extend existing file)*

Add the following mock actions alongside the existing ones:
```ts
renameFolderAction: vi.fn(),
deleteFolderAction: vi.fn(),
moveFolderAction: vi.fn(),
```

#### Folder rename (component)

| # | Test | Scenario | Expected |
|---|---|---|---|
| CR-1 | Rename from grid — optimistic update | Type new name → Enter | New name visible before action resolves |
| CR-2 | Rename rolls back on server error | Action rejects | Original name restored; `toast.error` called |
| CR-3 | Rename no-op does not call action | Commit unchanged name | `renameFolderAction` not called |
| CR-4 | Rename fires only once on Enter + blur | Enter then immediately blur the input | Action called exactly once |

#### Folder delete (component)

| # | Test | Scenario | Expected |
|---|---|---|---|
| CD-1 | Delete dialog shows descendant count copy | Folder with 2 files, 1 sub-folder | Dialog text contains "2 files" and "1 sub-folder" |
| CD-2 | Optimistically removes folder from view | Action pending | Folder card/row disappears immediately |
| CD-3 | Rollback on server error | Action rejects | Folder reappears; `toast.error` called |
| CD-4 | Delete fires only once | Click "Delete" twice rapidly | `deleteFolderAction` called exactly once |
| CD-5 | Navigates to parent when current folder is deleted | User is inside the deleted folder | Current view resets to root / parent |

> **Production concern — CD-5:** If the user is currently navigated inside the folder being deleted and the UI does not reset `currentFolderId`, they see a ghost folder view with no files and no breadcrumb pointing to a real location. `FilesLibrary` must detect that `currentFolderId` is no longer in `folders` state and fall back to `null`.

#### Folder move (component)

| # | Test | Scenario | Expected |
|---|---|---|---|
| CM-1 | Destination list excludes the folder being moved | Open move dialog for "Projects" | "Projects" not listed as a destination |
| CM-2 | Destination list excludes entire subtree | "Projects" has child "Taxes" | Neither "Projects" nor "Taxes" appear |
| CM-3 | Move fires only once | Click "Move" twice rapidly | `moveFolderAction` called exactly once |
| CM-4 | Optimistic parent update | Move "Projects" into "Archive" | "Projects" card disappears from root view |
| CM-5 | Rollback on server error | Action rejects | "Projects" reappears; `toast.error` called |

---

### Layer 2b — Utility Tests
**File:** `tests/files/file-browser-utils.test.ts` *(extend existing file)*

| # | Test | Input | Expected |
|---|---|---|---|
| U-1 | `getFolderDepth` for root folder | folder with no parent | Returns `0` |
| U-2 | `getFolderDepth` for a 3-level nest | grandparent→parent→child | Returns `2` for child |
| U-3 | `getFolderPath` with missing intermediate node | chain broken mid-way | Returns partial path up to the missing node |
| U-4 | `compareFolders` sorts by name ascending | `["Zeta", "Alpha"]` | `["Alpha", "Zeta"]` |
| U-5 | `matchesExplorerFilter` — accents/unicode | name `"Résumé"`, filter `"resume"` | Returns `false` (current impl is simple `includes`; test documents actual behaviour) |

---

### Layer 3 — E2E Tests (Playwright)
**File:** `tests/e2e/file-actions.spec.ts` *(extend existing file)*

All E2E tests reuse `signUpAndBypassVerification`, `createFolder`, `getGridFolderButton`, and `cleanupTestUserByEmail` helpers.

#### Folder rename

```
test("renames a folder from the grid and verifies the breadcrumb updates")
```
Steps:
1. Create folder "Projects"
2. Right-click / open actions on folder card → "Rename"
3. Fill new name "Archives" → confirm
4. Verify toast "Folder renamed"
5. Verify folder card shows "Archives"
6. Navigate into "Archives" → verify breadcrumb shows `All files / Archives`
7. Verify no "File not found" or error toast

#### Folder delete with cascade

```
test("deletes a folder and confirms all nested content is removed")
```
Steps:
1. Create folder "Documents"
2. Navigate into "Documents" → create sub-folder "Taxes"
3. Navigate into "Taxes" → upload `tiny.pdf`
4. Navigate back to root → open delete on "Documents"
5. Verify confirmation dialog text mentions files and sub-folders
6. Confirm delete → verify toast "Folder deleted"
7. Verify "Documents" no longer visible
8. Verify directly navigating to where "Taxes" was shows nothing (folder not in breadcrumbs)

#### Folder-to-folder move

```
test("moves a folder into another folder and verifies navigation hierarchy")
```
Steps:
1. Create "Archive" at root
2. Create "Projects" at root
3. Move "Projects" into "Archive"
4. Verify "Projects" no longer visible at root
5. Navigate into "Archive" → verify "Projects" is visible
6. Navigate into "Projects" → verify breadcrumbs show `All files / Archive / Projects`

#### Ghost-view regression

```
test("resets to root when the currently-open folder is deleted from another tab or action")
```
Steps:
1. Navigate into folder "Temp"
2. Delete "Temp" (via action menu in breadcrumb or via a direct call)
3. Verify UI falls back to root view (breadcrumb shows "All files" only)
4. Verify no stuck empty-state or broken breadcrumb

#### Circular-move rejection

```
test("cannot move a parent folder into one of its own descendants")
```
Steps:
1. Create "A" at root → navigate into "A" → create "B" inside "A"
2. Navigate back to root → open move dialog on "A"
3. Verify "B" is not listed as a destination (excluded as a descendant)
4. If "B" could be selected, verify the action fails with a user-facing error

---

### Manual Verification Checklist

Before marking Phase 7 complete, verify each item in a local dev environment:

- [ ] Create a folder "Documents" — appears in grid and list view
- [ ] Navigate into "Documents" — breadcrumb shows `All files / Documents`
- [ ] Create sub-folder "Taxes" — breadcrumb shows `All files / Documents / Taxes`
- [ ] Upload file into "Taxes" — navigate back to root — file **not** visible at root
- [ ] Rename "Documents" to "Archives" — breadcrumb and card update in place
- [ ] Move "Archives" into a new folder "Storage" — "Archives" disappears from root
- [ ] Navigate into "Storage / Archives" — breadcrumb reflects full path
- [ ] Delete "Storage" from root — confirmation dialog shows correct file and sub-folder count
- [ ] Confirm delete — all nested content gone; navigating to any deleted folder shows root
- [ ] Attempt to move "Storage" into "Archives" (a descendant) — action rejected

---

## Unchanged Deliverables (already done, keep as-is)

| Output | Location |
|---|---|
| Folder schema | `src/lib/db/schema/folders.ts` |
| Folder list + create | `src/app/api/files/service.ts` |
| Server actions (create, file move, file delete) | `src/app/(dashboard)/files/actions.ts` |
| Create folder dialog | `src/components/files/create-folder-dialog.tsx` |
| Breadcrumbs | `src/components/files/files-breadcrumbs.tsx` |
| Folder navigation in grid + list | `src/components/files/file-grid.tsx`, `file-list.tsx` |
| Move dialog with depth indentation | `src/components/files/move-files-dialog.tsx` |
| Existing Vitest coverage (file ops + `getFolderPath` cycle guard) | `tests/services/file-service.test.ts`, `tests/files/` |
