# Phase 10 - Trash & Soft Delete

> **Objective:** Deliver a production-ready trash system for soft-deleted files and folders, including restore flows, permanent delete, and automated cleanup for expired trash and stale uploads.

**Depends on:** Phase 6 (File Management UI), Phase 7 (Folder System)  
**Blueprint ref:** Section 19 (Trash / Soft Delete), Section 21.5 (Background Jobs / Cron)

---

## Implementation Status vs Codebase Reality

Audited on **2026-04-04** against `secure-vault/`.

### Already Implemented

| Feature | Location |
| --- | --- |
| `files.deleted_at` schema column | `src/lib/db/schema/files.ts` |
| `folders.deleted_at` schema column | `src/lib/db/schema/folders.ts` |
| File list excludes soft-deleted files | `src/app/api/files/service.ts` via `listReadyFilesForUser()` |
| Storage aggregate excludes soft-deleted ready files | `src/app/api/files/service.ts` via `getStorageUsage()` |
| `softDeleteFile()` | `src/app/api/files/service.ts` |
| `bulkSoftDelete()` | `src/app/api/files/service.ts` |
| Recursive `softDeleteFolder()` for folder subtree + nested files | `src/app/api/files/service.ts` |
| `deleteFileAction()`, `deleteFolderAction()`, `bulkDeleteAction()` | `src/app/(dashboard)/files/actions.ts` |
| `/trash` route already exists | `src/app/(dashboard)/trash/page.tsx` |
| Trash page is currently a placeholder | `src/components/trash/trash-page-content.tsx` |
| Trash nav link already exists | `src/components/dashboard/dashboard-navigation.ts` |
| R2 delete/list helpers already exist | `src/lib/storage/r2.ts` |
| Upload sessions already have `expires_at` and `status` enum | `src/lib/db/schema/upload-sessions.ts` |
| Existing Vitest coverage for file soft delete | `tests/services/file-service.test.ts`, `tests/files/files-actions.test.ts`, `tests/files/files-library.test.tsx` |
| Existing Vitest coverage for folder soft delete | `tests/services/folder-service.test.ts`, `tests/files/files-library.test.tsx` |

### Corrections to the Current Draft

- The service does **not** live in `src/lib/services/file-service.ts`; the real implementation lives in `src/app/api/files/service.ts`.
- `/trash` and the dashboard nav entry already exist, but only as placeholders.
- Folder soft delete is already implemented, so a production trash phase must support **folders as first-class trash items**, not files only.
- `upload_sessions.status` currently supports `uploading`, `completed`, `failed`, and `expired`. There is no `initialized` status in the schema.
- `upload_sessions.file_id` cascades on file delete, so stale upload cleanup cannot both "delete the file row" and "keep an expired session row forever" with the current schema. This phase should prefer cleanup over historical retention.
- `share_links.file_id` and `share_links.folder_id` use `ON DELETE SET NULL`, not cascade. Permanent delete must explicitly remove share-link rows for purged targets so dead links do not linger.
- Quota is only reclaimed on permanent delete today. Soft delete should **not** be presented as freeing quota immediately.
- There is no `src/app/api/cron/cleanup/route.ts` yet, and there is no `secure-vault/vercel.json` yet.

---

## Architecture Chosen

### A. Trash shows root deleted items, not every deleted descendant

This phase should show:

- Standalone deleted files
- Deleted folders whose parent is not deleted
- Deleted files whose parent folder is not deleted

This phase should **not** show nested descendants of a deleted folder as separate trash rows. If a deleted folder and all of its children are shown together, the UI becomes noisy, restore order becomes ambiguous, and "Empty Trash" risks double-counting nested content.

Result:

- Deleting a folder subtree produces **one trash row for the deleted folder root**
- Restoring that folder restores the subtree
- Permanently deleting that folder permanently deletes the subtree

### B. Keep a stable public service surface, but split private trash internals for maintainability

Do **not** introduce a parallel `src/lib/services/file-service.ts`.

Keep the public entrypoints anchored to:

- `src/app/api/files/service.ts`

For maintainability, trash-specific private implementation can be extracted into adjacent modules and delegated from `service.ts`, for example:

- `src/app/api/files/trash-service.ts`
- `src/app/api/files/trash-purge.ts`

Add thin feature-specific modules where they improve readability:

- `src/lib/constants/trash.ts`
- `src/lib/trash/types.ts`
- `src/lib/trash/trash-query.ts`
- `src/hooks/use-trash-query.ts`
- `src/hooks/use-trash-summary-query.ts`

This keeps the caller-facing import surface stable while avoiding a single oversized service file. It also matches the current codebase pattern: the core service boundary lives under `src/app/api/files/`, while React Query fetch helpers live under `src/lib/*` and `src/hooks/*`.

### C. Restore semantics preserve location integrity

- `restoreFile(userId, fileId)` may restore a file only when its parent folder is `null` or active.
- If the parent folder is still deleted, the restore must fail with a user-facing conflict such as `"Restore the parent folder first"`.
- `restoreFolder(userId, folderId)` restores the folder and every deleted descendant folder/file in the subtree.
- The trash page only exposes restore for root deleted folders so the user never has to restore descendants in the correct order manually.

### D. Permanent delete uses one shared purge executor

User-triggered permanent delete, empty trash, and cron auto-purge must all call the same internal purge pipeline.

Recommended internal shape:

- `buildTrashPurgeManifest(...)`
- `purgeDeletedFiles(...)`
- `purgeDeletedFolderSubtree(...)`
- `deleteR2ObjectsFromManifest(...)`

Important design choice:

- The database is the source of truth for user-visible correctness.
- The purge flow should delete metadata and reclaim quota in a DB transaction, then perform best-effort R2 cleanup using the manifest captured before commit.
- This intentionally prefers a possible orphaned R2 object over a broken restored record or a half-deleted database row.

Implementation notes:

- Capture `fileId`, `userId`, `size`, `status`, `thumbnail_r2_key`, and chunk `r2_key`s before deleting rows.
- Delete share-link rows explicitly for the file/folder scope before deleting the owning file/folder rows.
- Reclaim quota only for files that previously counted toward `users.storage_used`:
  - `files.status = "ready"`
  - Use a DB expression such as `GREATEST(users.storage_used - reclaimedBytes, 0)` to avoid negative values.
- After the transaction commits, delete exact chunk keys plus a prefix fallback like `${userId}/files/${fileId}` to clean up stray partial objects.

### E. Query and cache model must keep Files, Trash, and the sidebar in sync

The current app uses:

- Server-rendered page data for initial load
- Client components with React Query for refresh/invalidation
- Server actions for mutations

Trash should follow the same model:

- `/trash` page loads initial trash data on the server
- `TrashPageContent` becomes a client component that uses a trash query hook
- Sidebar badge uses a lightweight trash summary query
- File deletes from `/files` must invalidate the trash summary query so the badge updates immediately
- Restores and permanent deletes from `/trash` must invalidate both the trash query and the files explorer query

### F. Quota semantics must be explicit

Soft-deleted items still count against `users.storage_used` until permanently deleted or auto-purged.

This phase should therefore:

- Avoid claiming that moving to trash frees quota immediately
- Add UI copy on `/trash` explaining that permanent delete reclaims storage
- Consider relabeling any active-library-only metric on `/files` if it could be confused with actual quota usage

### G. Maintainability and production-engineering standards are part of the scope

This phase should be implemented as a long-lived production feature, not as a one-off patch.

Code-structure expectations:

- Keep route handlers and server actions thin.
  - Validation, auth, and revalidation only.
  - Business rules belong in service/helper modules.
- Keep destructive logic centralized.
  - There should be one canonical purge pipeline used by permanent delete, empty trash, and cron auto-purge.
- Avoid duplicated predicates.
  - Root-trash detection, subtree discovery, and quota-reclaim rules should live in shared helpers instead of being repeated in routes, actions, and UI.
- Prefer pure helpers for deterministic logic.
  - Examples: root-trash classification, purge cutoff calculation, descendant counting, reclaimed-byte calculation.
- Keep component responsibilities narrow.
  - `TrashPageContent` can coordinate state and mutations, but list rendering, row actions, and confirmation dialogs should be split into focused child components if the file becomes dense.

Professional production practices required in this phase:

- Idempotency:
  - restore, permanent delete, empty trash, and cron cleanup must be safe to retry
- Transaction discipline:
  - DB state changes that must remain consistent belong in one transaction
- Bounded execution:
  - cleanup jobs must process in batches and avoid unbounded work in one pass
- Structured logging:
  - cron and purge failures should log enough context to debug without leaking secrets or sensitive payloads
- Explicit failure semantics:
  - known user-facing conflicts should throw stable messages
  - background cleanup should degrade gracefully on partial R2 failures
- Single source of truth for constants:
  - retention days, batch sizes, and summary rules should not be duplicated across files
- Testability first:
  - complex logic should be factored so unit tests can validate it without rendering the UI or invoking full routes

Definition of done for this phase:

- No placeholder trash UI remains
- No duplicate purge logic exists across user actions and cron
- Core helpers have targeted unit coverage
- User-visible flows have integration/E2E coverage
- Storage/quota copy is consistent across `/files` and `/trash`
- Cleanup route is authenticated, batched, and observable
- No unresolved TODOs are left in the shipped implementation

---

## Detailed Tasks

### 10.1 - Add trash constants and typed response models

- [ ] Add `src/lib/constants/trash.ts`
  - Export `TRASH_RETENTION_DAYS = 30`
  - Export `TRASH_RETENTION_MS`
  - Export cleanup batch constants, for example:
    - `TRASH_PURGE_BATCH_SIZE`
    - `STALE_UPLOAD_CLEANUP_BATCH_SIZE`
- [ ] Export the new constants from `src/lib/constants/index.ts`
- [ ] Add `src/lib/trash/types.ts`
  - Suggested types:
    - `TrashFileItem`
    - `TrashFolderItem`
    - `TrashSummary`
    - `TrashPageData`
    - `TrashPurgeResult`
    - `ExpiredUploadCleanupResult`
- [ ] Prefer returning `deletedAt` and `purgeAt` from the service rather than preformatted text
  - Let the UI compute "days remaining"
  - This keeps the service deterministic and testable

Suggested minimum fields:

| Type | Fields |
| --- | --- |
| `TrashFileItem` | `id`, `kind: "file"`, `name`, `mimeType`, `size`, `folderId`, `deletedAt`, `purgeAt` |
| `TrashFolderItem` | `id`, `kind: "folder"`, `name`, `parentId`, `deletedAt`, `purgeAt`, `descendantFileCount`, `descendantFolderCount`, `totalBytes` |
| `TrashSummary` | `rootFileCount`, `rootFolderCount`, `totalRootItemCount` |
| `TrashPurgeResult` | `deletedFiles`, `deletedFolders`, `reclaimedBytes` |

---

### 10.2 - Extend the service layer for trash listing and restore

**Primary file:** `src/app/api/files/service.ts`

**Maintainability note:** If `service.ts` starts becoming difficult to scan, extract trash-only private helpers into `src/app/api/files/trash-service.ts` and keep `service.ts` as the stable facade.

- [ ] Add `listTrashForUser(userId)`
  - Return root deleted files + root deleted folders + summary
  - Sort by `deletedAt DESC`
- [ ] Add `getTrashSummary(userId)`
  - Return counts for sidebar badge
  - Use the same "root deleted item" definition as `listTrashForUser()`
- [ ] Add `restoreFile(userId, fileId)`
  - Scope by user ownership
  - Require `deleted_at IS NOT NULL`
  - If parent folder exists and `parent.deleted_at IS NOT NULL`, throw `"Restore the parent folder first"`
  - Clear `deleted_at`
  - Return the restored file row in `FileListItem` shape
- [ ] Add `restoreFolder(userId, folderId)`
  - Load the user's folder tree including deleted rows
  - Require the target folder to exist and be deleted
  - If the parent folder exists and is still deleted, throw `"Restore the parent folder first"`
  - Restore the entire subtree in one transaction:
    - clear `folders.deleted_at` for subtree folders
    - clear `files.deleted_at` for files in that subtree
  - Return `{ restoredFiles, restoredFolders }`

Trash root detection rules:

- Root deleted folder:
  - `folder.deleted_at IS NOT NULL`
  - `folder.parent_id IS NULL` OR parent folder is active
- Root deleted file:
  - `file.deleted_at IS NOT NULL`
  - `file.folder_id IS NULL` OR parent folder is active

Do not list:

- A deleted file whose containing folder is already deleted
- A deleted folder whose parent folder is also deleted

Those descendants should be represented only by the deleted root folder row.

Folder trash summary calculation:

- Reuse the existing in-memory subtree traversal approach from Phase 7
- For each deleted root folder, compute:
  - `descendantFolderCount`
  - `descendantFileCount`
  - `totalBytes`

Idempotency expectations:

- Restoring an already-restored file should return the current active file record if it still belongs to the user
- Restoring an already-restored folder should return `{ restoredFiles: 0, restoredFolders: 0 }`
- Missing or foreign rows must still throw `"File not found"` / `"Folder not found"`
- [ ] Extract shared pure helpers instead of repeating inline logic, for example:
  - `isRootDeletedFolder(...)`
  - `isRootDeletedFile(...)`
  - `getTrashPurgeAt(...)`
  - `summarizeDeletedFolderSubtree(...)`

---

### 10.3 - Add permanent delete, empty trash, and shared purge helpers

**Primary file:** `src/app/api/files/service.ts`

**Maintainability note:** Keep one purge implementation path. If needed, move purge internals into `src/app/api/files/trash-purge.ts` and call that from both user actions and cron.

- [ ] Add internal helper `buildTrashPurgeManifest(...)`
  - Gather all target file metadata before deletion:
    - `file.id`
    - `file.user_id`
    - `file.size`
    - `file.status`
    - `file.thumbnail_r2_key`
    - all `file_chunks.r2_key`
- [ ] Add internal helper `deleteShareLinksForTrashScope(...)`
  - Explicitly delete `share_links` rows for:
    - purged file ids
    - purged folder ids
- [ ] Add internal helper `deleteR2ObjectsFromManifest(...)`
  - Delete exact keys from the manifest
  - Then run a prefix cleanup for each file id as a backstop
  - Treat missing objects as success
  - Log unexpected failures with `fileId`, `userId`, and key/prefix context
- [ ] Add `permanentlyDeleteFile(userId, fileId)`
  - Only allow permanently deleting rows already in trash
  - Build manifest
  - DB transaction:
    - verify file still belongs to user and is deleted
    - delete related share links
    - delete file row
    - decrement `users.storage_used` for ready files only
  - After commit: delete R2 objects from the manifest
  - Return `{ deletedFiles: 1, deletedFolders: 0, reclaimedBytes }`
- [ ] Add `permanentlyDeleteFolder(userId, folderId)`
  - Only allow on a deleted root folder
  - Gather the subtree folder ids
  - Build a manifest for every file in the subtree
  - DB transaction:
    - delete share links for subtree folders/files
    - delete file rows in the subtree
    - delete folder rows in the subtree
    - reclaim quota for ready files in the subtree
  - After commit: delete R2 objects from the manifest
  - Return `{ deletedFiles, deletedFolders, reclaimedBytes }`
- [ ] Add `emptyTrash(userId)`
  - Purge all root deleted files and root deleted folders for the user
  - Must not double-count nested descendants under deleted folders
  - Return cumulative counts and reclaimed bytes

Important production rules:

- Permanent delete must be a **trash-only** action. Do not allow it for active items.
- Folder purge must be bounded to the subtree rooted at the deleted folder.
- Empty trash must process root deleted folders first or otherwise deduplicate file ids so files inside deleted folder subtrees are not purged twice.
- Reclaimed bytes must be based on the purged ready-file manifest, not on a fresh aggregate query after deletion.
- [ ] Add structured operational logging around purge execution
  - Log counts, reclaimed bytes, and failure summaries
  - Do not log secrets, bearer tokens, or plaintext sensitive payloads
- [ ] Keep helper functions small and named after business intent rather than DB mechanics
  - Example: prefer `collectPurgeableFileIdsForFolderSubtree(...)` over vague helpers like `processRows(...)`

Recommended return shape for all purge functions:

```ts
{
  deletedFiles: number;
  deletedFolders: number;
  reclaimedBytes: number;
}
```

---

### 10.4 - Add routes, server actions, and query helpers

### Server actions

- [ ] Add `src/app/(dashboard)/trash/actions.ts`
  - `restoreFileAction(fileId)`
  - `restoreFolderAction(folderId)`
  - `permanentlyDeleteFileAction(fileId)`
  - `permanentlyDeleteFolderAction(folderId)`
  - `emptyTrashAction()`
- [ ] Each action must:
  - validate ids
  - call `requireCurrentUser()`
  - call the service function
  - `revalidatePath("/trash")`
  - `revalidatePath("/files")`
- [ ] Keep actions intentionally thin
  - no direct DB access
  - no duplicated restore/purge logic
  - no inline query logic

### API routes for React Query

- [ ] Add `src/app/api/files/trash/route.ts`
  - `GET` returns `TrashPageData`
- [ ] Add `src/app/api/files/trash/summary/route.ts`
  - `GET` returns `TrashSummary`

### React Query helpers

- [ ] Add `src/lib/trash/trash-query.ts`
  - `trashQueryKey`
  - `trashSummaryQueryKey`
  - `fetchTrashPageData()`
  - `fetchTrashSummary()`
- [ ] Add `src/hooks/use-trash-query.ts`
- [ ] Add `src/hooks/use-trash-summary-query.ts`
- [ ] Keep query keys centralized in one module so invalidation stays maintainable

### Cross-feature cache invalidation

- [ ] Update `src/components/files/files-library.tsx`
  - After successful file delete, bulk delete, or folder delete:
    - invalidate the trash summary query
  - This keeps the sidebar badge in sync while the user remains on `/files`
- [ ] In the new trash client component:
  - after restore or permanent delete:
    - invalidate the trash query
    - invalidate the trash summary query
    - invalidate `filesExplorerQueryKey`

---

### 10.5 - Build the trash page and sidebar badge

### Trash page

- [ ] Update `src/app/(dashboard)/trash/page.tsx`
  - Fetch initial trash data server-side for the signed-in user
  - Pass it into `TrashPageContent`
- [ ] Replace the placeholder `src/components/trash/trash-page-content.tsx`
  - Convert it into a client component
  - Render trash rows/cards for both files and folders
  - Show:
    - item type
    - name
    - deleted date
    - purge date or days remaining
    - size for files
    - descendant counts + total bytes for folders
  - Actions:
    - `Restore`
    - `Delete permanently`
  - Toolbar:
    - `Empty Trash`
- [ ] Split UI into focused child components if the page starts carrying too many responsibilities, for example:
  - `src/components/trash/trash-list.tsx`
  - `src/components/trash/trash-item-row.tsx`
  - `src/components/trash/trash-item-actions.tsx`
  - `src/components/trash/empty-trash-dialog.tsx`

### UX requirements

- [ ] Show an explanatory note that items in trash still count against storage until permanently deleted
- [ ] Align storage copy between `/files` and `/trash`
  - Do not imply that soft delete freed quota immediately
  - If needed, relabel the `/files` aggregate card to distinguish "active library size" from actual quota usage
- [ ] Folder rows must represent the subtree once, not once per descendant
- [ ] `Delete permanently` and `Empty Trash` must use confirmation dialogs
- [ ] Disable action buttons while the action is pending
- [ ] Show an empty state when trash is empty
- [ ] If a restore fails because the parent folder is still deleted, show the exact error message from the server action

### Navigation badge

- [ ] Update `src/components/dashboard/dashboard-navigation-panel.tsx`
  - Fetch `TrashSummary`
  - Show badge beside the Trash nav item when `totalRootItemCount > 0`
  - Hide the badge when zero
- [ ] Confirm the same panel behavior works in:
  - desktop sidebar
  - mobile nav drawer

---

### 10.6 - Add consolidated cleanup cron

**Primary file:** `src/app/api/cron/cleanup/route.ts`

- [ ] Add a protected cleanup route
  - Require `Authorization: Bearer ${CRON_SECRET}`
  - Reject missing or mismatched secrets with `401`
- [ ] Add helper `purgeExpiredTrash(...)`
  - Find root deleted files and root deleted folders where:
    - `deleted_at <= now - 30 days`
  - Reuse the same purge helpers used by user-triggered permanent delete
  - Process in bounded batches to keep the route safe for serverless execution
- [ ] Add helper `cleanupExpiredUploads(...)`
  - Target:
    - `upload_sessions.status = "uploading"`
    - `upload_sessions.expires_at < now`
  - Build a manifest from the expired upload's file row + chunk keys
  - DB transaction:
    - delete related file rows (which will cascade upload sessions and file chunks)
    - do **not** decrement `users.storage_used` because quota is only incremented on upload completion
  - After commit:
    - delete chunk R2 objects by exact keys + file prefix fallback
- [ ] Return a structured JSON summary

Suggested response shape:

```json
{
  "trash": {
    "deletedFiles": 0,
    "deletedFolders": 0,
    "reclaimedBytes": 0
  },
  "uploads": {
    "deletedFiles": 0,
    "expiredSessions": 0
  }
}
```

### Deployment config

- [ ] Add `secure-vault/vercel.json`
  - Configure the cleanup cron for every 6 hours:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

### Operational guardrails

- [ ] Keep cleanup batch sizes small enough for a single route invocation
- [ ] Log per-batch failures with enough context to retry manually
- [ ] Do not fail the entire route because one R2 key is already missing

---

## Recommended Implementation Order

1. Add constants and trash types.
2. Implement `listTrashForUser()`, `getTrashSummary()`, `restoreFile()`, and `restoreFolder()`.
3. Implement purge manifest helpers and permanent delete functions.
4. Add server actions and API routes.
5. Build the trash page UI and sidebar badge.
6. Wire cache invalidation between `/files`, `/trash`, and the sidebar.
7. Implement the cleanup cron and deployment config.
8. Finish with automated tests and manual verification.

---

## Testing

Three test layers should be used here:

- Vitest service/unit tests
- Vitest + React Testing Library component/integration tests
- Playwright E2E for user-visible flows

### Run commands

```bash
npx vitest run tests/services/file-service.test.ts tests/services/folder-service.test.ts
npx vitest run tests/files/files-actions.test.ts
npx vitest run tests/trash/trash-actions.test.ts
npx vitest run tests/trash/trash-page-content.test.tsx
npx vitest run tests/dashboard/dashboard-navigation-panel.test.tsx
npx vitest run tests/cron/cleanup-route.test.ts
npx playwright test tests/e2e/trash.spec.ts
```

---

### Layer 1 - Service / Unit Tests

Extend the existing service tests instead of creating a second competing service abstraction.

#### `tests/trash/trash-utils.test.ts` *(new file, if pure helpers are extracted)*

| # | Test | Expected |
| --- | --- | --- |
| U-1 | Root deleted file classification ignores files under deleted folders | Helper returns `false` for nested descendants |
| U-2 | Root deleted folder classification ignores deleted children of deleted folders | Helper returns `false` for nested deleted folders |
| U-3 | Purge cutoff calculation uses the shared retention constant | No duplicated date math |
| U-4 | Reclaimed-byte calculation counts only ready files | Matches quota semantics |

#### `tests/services/file-service.test.ts`

| # | Test | Expected |
| --- | --- | --- |
| F-1 | `listTrashForUser()` returns standalone deleted files | Active files are excluded; deleted root files are included |
| F-2 | `listTrashForUser()` excludes files inside deleted folders | No duplicate child file trash rows |
| F-3 | `restoreFile()` clears `deleted_at` for a standalone trashed file | Returns restored file |
| F-4 | `restoreFile()` rejects restore when parent folder is still deleted | Throws `"Restore the parent folder first"` |
| F-5 | `permanentlyDeleteFile()` rejects active files | Throws `"File not found"` or conflict-style error |
| F-6 | `permanentlyDeleteFile()` deletes share links and decrements storage for ready files | Transaction updates `users.storage_used` safely |
| F-7 | `permanentlyDeleteFile()` does not decrement storage for non-ready files | `reclaimedBytes` reflects actual quota semantics |
| F-8 | `emptyTrash()` purges root deleted files without double-counting subtree descendants | Counts are correct |
| F-9 | Expired trash purge respects the 30-day boundary | Exactly-at-cutoff rows are purged; newer rows are not |
| F-10 | Expired upload cleanup targets `status = "uploading"` and `expires_at < now` | `completed` and `failed` sessions are untouched |
| F-11 | Expired upload cleanup does not decrement `users.storage_used` | No quota reclaim for never-completed uploads |
| F-12 | Missing R2 objects are treated as idempotent success | No hard failure on `NoSuchKey`-style cases |

#### `tests/services/folder-service.test.ts`

| # | Test | Expected |
| --- | --- | --- |
| D-1 | `listTrashForUser()` returns deleted root folders only | Deleted child folders under a deleted parent are excluded |
| D-2 | Deleted root folder summary includes descendant file/folder counts | Counts match subtree contents |
| D-3 | `restoreFolder()` restores an entire subtree | All descendant folders/files have `deleted_at = null` |
| D-4 | `restoreFolder()` rejects when the parent folder is still deleted | Throws `"Restore the parent folder first"` |
| D-5 | `permanentlyDeleteFolder()` deletes only the target subtree | Sibling folders/files remain untouched |
| D-6 | `permanentlyDeleteFolder()` returns accurate `deletedFiles`, `deletedFolders`, and `reclaimedBytes` | No double counting |
| D-7 | `emptyTrash()` with one deleted folder root purges the subtree once | Nested files are not counted twice |

---

### Layer 2 - Component / Integration Tests

#### `tests/trash/trash-actions.test.ts` *(new file)*

| # | Test | Expected |
| --- | --- | --- |
| A-1 | `restoreFileAction()` validates empty ids before auth | Rejects invalid input early |
| A-2 | `restoreFileAction()` revalidates both `/files` and `/trash` | Both paths are invalidated |
| A-3 | `permanentlyDeleteFileAction()` revalidates both `/files` and `/trash` | Both paths are invalidated |
| A-4 | `emptyTrashAction()` requires auth and revalidates both pages | Auth enforced; both paths revalidated |

#### `tests/trash/trash-page-content.test.tsx` *(new file)*

| # | Test | Expected |
| --- | --- | --- |
| C-1 | Renders file and folder trash rows from initial data | Both item types display correctly |
| C-2 | Shows folder subtree counts and total bytes | Folder row summarizes subtree, not descendants as separate rows |
| C-3 | Restore file removes the row optimistically | Row disappears before action resolves |
| C-4 | Restore rollback on failure | Row reappears and `toast.error` is shown |
| C-5 | Restore folder fires once on repeated clicks | Single action invocation |
| C-6 | Permanent delete requires confirmation | No deletion until confirmed |
| C-7 | Permanent delete removes the row and invalidates queries | Trash row gone; files query invalidated |
| C-8 | Empty Trash is disabled while pending | No duplicate submissions |
| C-9 | Parent-folder restore error is surfaced to the user | Error toast/message matches server error |

#### `tests/files/files-library.test.tsx`

| # | Test | Expected |
| --- | --- | --- |
| FL-1 | Deleting a file invalidates the trash summary query | Sidebar badge can update immediately |
| FL-2 | Deleting a folder invalidates the trash summary query | Trash badge reflects new root deleted folder |

#### `tests/dashboard/dashboard-navigation-panel.test.tsx` *(new file)*

| # | Test | Expected |
| --- | --- | --- |
| N-1 | Shows trash badge when summary count is non-zero | Badge visible beside Trash |
| N-2 | Hides trash badge when count is zero | No empty badge chrome |

---

### Layer 3 - Route Tests

#### `tests/cron/cleanup-route.test.ts` *(new file)*

| # | Test | Expected |
| --- | --- | --- |
| R-1 | Rejects missing auth header | `401` |
| R-2 | Rejects wrong bearer token | `401` |
| R-3 | Runs trash purge and stale upload cleanup together | JSON summary contains both sections |
| R-4 | Returns `200` when nothing needs cleanup | Zero-count summary |
| R-5 | Does not abort the whole route for an already-missing R2 key | Successful response with logged warning |

---

### Layer 4 - E2E Tests

#### `tests/e2e/trash.spec.ts` *(new file)*

| # | Scenario | Expected |
| --- | --- | --- |
| E-1 | Delete a standalone file from `/files` | File disappears from Files, appears in Trash, and Trash badge increments |
| E-2 | Restore a standalone file from `/trash` | File disappears from Trash and reappears in Files |
| E-3 | Delete a folder containing nested files | Trash shows one folder root row, not separate child-file rows |
| E-4 | Restore a deleted folder subtree | Folder and nested files reappear in their original hierarchy |
| E-5 | Permanently delete a trashed file | File disappears from Trash and is no longer recoverable |
| E-6 | Empty Trash with mixed standalone files and deleted folders | Trash becomes empty; badge clears |

Recommended E2E notes:

- Reuse the existing signup/upload helpers from `tests/e2e/file-actions.spec.ts`
- Keep trash E2E in its own spec file so the phase is independently verifiable
- Verify both desktop-visible content and sidebar badge behavior

---

## Manual Verification Checklist

- [ ] Delete a standalone file from `/files` and verify it disappears from the file explorer
- [ ] Open `/trash` and verify the file appears with deleted date and days remaining
- [ ] Restore the file and verify it returns to the original location in `/files`
- [ ] Delete a folder subtree and verify Trash shows the folder once, not its descendants as separate rows
- [ ] Restore the deleted folder and verify nested files/folders return correctly
- [ ] Permanently delete a trashed file and verify it disappears from Trash
- [ ] Permanently delete a deleted folder subtree and verify no child entries remain
- [ ] Empty Trash and verify the page returns to the empty state and the sidebar badge clears
- [ ] Refresh the dashboard and verify the Trash badge remains correct
- [ ] Trigger `/api/cron/cleanup` with the correct bearer token and verify the JSON summary is returned
- [ ] Seed an expired upload session and verify cleanup removes the partial upload metadata without reclaiming completed-upload quota
- [ ] Review logs for one successful cleanup run and one failure path to verify they are actionable without exposing secrets

---

## Deliverables

| Output | Location |
| --- | --- |
| Trash constants and types | `src/lib/constants/trash.ts`, `src/lib/trash/types.ts` |
| Trash service logic | `src/app/api/files/service.ts` plus optional internal helpers in `src/app/api/files/trash-service.ts` and `src/app/api/files/trash-purge.ts` |
| Trash server actions | `src/app/(dashboard)/trash/actions.ts` |
| Trash query routes | `src/app/api/files/trash/route.ts`, `src/app/api/files/trash/summary/route.ts` |
| Trash page UI | `src/app/(dashboard)/trash/page.tsx`, `src/components/trash/trash-page-content.tsx` |
| Sidebar badge integration | `src/components/dashboard/dashboard-navigation-panel.tsx` |
| Cleanup cron | `src/app/api/cron/cleanup/route.ts`, `secure-vault/vercel.json` |
| Automated coverage | `tests/services/`, `tests/trash/`, `tests/dashboard/`, `tests/cron/`, `tests/e2e/trash.spec.ts` |
