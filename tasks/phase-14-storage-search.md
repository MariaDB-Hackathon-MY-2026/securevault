# Phase 14 - Storage Dashboard and Search

> **Objective:** Upgrade the existing files page into a real storage dashboard and add global filename search without breaking the current file-browser UX.

**Depends on:** Phase 6 (File Management UI), Phase 10 (Trash / Soft Delete)  
**Related phase:** Phase 19 (Semantic Indexing and Search)  
**Blueprint ref:** Section 19 (Storage Dashboard, Search and Filter)

> [!IMPORTANT]
> This plan replaces older assumptions that storage should live under `settings` and that search should be implemented as a server action. The current codebase already has a files dashboard, a client-side quick filter, quota tracking on `users.storage_used`, and partial semantic-indexing scaffolding. Build on those seams instead of rebuilding them.

---

## Current Implementation Snapshot

- [x] `src/app/(dashboard)/files/page.tsx` already SSR-loads files, folders, and a basic storage usage summary.
- [x] `src/components/files/files-library.tsx` + `src/components/files/toolbar.tsx` already implement a local client-side quick filter using `matchesExplorerFilter`.
- [x] `src/components/dashboard/dashboard-navigation-panel.tsx` already shows quota progress using `user.storage_used / user.storage_quota`.
- [x] Upload completion increments `users.storage_used` in `src/app/api/upload/complete/service.ts`.
- [x] `UploadJob` already triggers `POST /api/embeddings` for eligible PDFs and images after upload completes.
- [x] `embedding_jobs` and `embedding_chunks` schema files already exist in `src/lib/db/schema/`.
- [ ] There is no dedicated storage dashboard read model.
- [ ] There is no global filename search API, hook, or result UI.
- [ ] `/api/search/*` and `/api/embeddings/*` route handlers are still placeholders.
- [ ] Semantic search execution should be completed in Phase 19, not duplicated here.

---

## Scope

- This phase owns:
  - Storage dashboard data model and files-page UI
  - Existing quick filter hardening
  - Global filename search API and UI
  - Search state design that can be extended later
- This phase does **not** own:
  - OCR
  - Embedding generation
  - Vector similarity search
  - Semantic indexing job processing
  - Semantic search backend implementation

> [!NOTE]
> If a search mode abstraction is introduced now, keep it extensible for Phase 19. Do not implement duplicate semantic-search backend logic in this phase.

---

## Architecture Guardrails

- Keep React components presentation-focused. No SQL and no business rules in components.
- Keep route handlers thin: auth, input validation, response shaping, and error mapping only.
- Put new storage-dashboard read logic in focused read-model modules under `src/lib/files/`.
- Put new global search logic in focused modules under `src/lib/search/`.
- Do not continue growing `src/app/api/files/service.ts` for every new read concern. It already contains broad file-service logic. Add new focused modules and call them from pages and route handlers.
- Keep pure helpers pure. MIME classification, search normalization, and result ranking must be unit-testable without React or DB mocks.
- All search and dashboard queries must be scoped by `userId`.
- Treat `users.storage_used` as the source of truth for quota-consumed bytes.
- Do not derive quota usage from active files only. Soft-deleted ready files still count toward quota until permanently deleted.
- Search must use REST endpoints plus TanStack Query to match the existing files explorer architecture. Do not use server actions on keystroke.
- Any dashboard or quota UI introduced in this phase must have an explicit client refresh strategy after uploads, soft delete, and permanent delete. Do not rely on initial SSR props staying correct after client-side mutations.
- Reuse the existing client fetcher conventions for authenticated routes. New query fetchers should throw the same `AuthError` shape already used by file and trash queries.
- For this phase, use a dedicated TanStack Query for dashboard refresh. Do not leave the implementation to `router.refresh()` because that is less precise and would force a junior engineer to choose between approaches.
- Preserve the current default UX: local quick filter remains the default search experience.

---

## Target Design

### Storage Dashboard

Render the storage dashboard on the existing files page, not under settings.

The dashboard must show:

- Quota used vs quota total
- Active library bytes and file count
- Trashed bytes and file count
- Breakdown by file category for active files only
- Largest active files list for cleanup

Recommended data contract:

```ts
type StorageDashboardData = {
  quotaBytes: number;
  quotaUsedBytes: number;
  usagePercent: number;
  activeBytes: number;
  activeFileCount: number;
  trashedBytes: number;
  trashedFileCount: number;
  breakdown: Array<{
    category: "documents" | "images" | "videos" | "audio" | "archives" | "other";
    bytes: number;
    fileCount: number;
    percentOfActiveBytes: number;
  }>;
  largestFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    folderId: string | null;
    updatedAt: string;
  }>;
};
```

Refresh requirement:

- The storage dashboard must not become stale after client-side actions.
- Introduce a dedicated client query for dashboard data.
- The same refresh strategy must keep quota-facing UI consistent with uploads, trash operations, and permanent delete.

### Search UX

Keep two distinct behaviors:

- `Filter` mode: existing instant local filter against already-loaded explorer data
- `Filename` mode: global server-backed search across all ready, non-deleted files owned by the user

Do not mix local folder browsing and global search results in the same result surface.

Expected behavior:

- `Filter` is the default mode and must preserve current behavior.
- `Filename` mode does not call the API for blank queries or queries shorter than 2 characters.
- `Filename` mode must use a debounced or deferred query value so the app does not issue a request on every single keystroke.
- When `Filename` mode has a valid query, render a dedicated result list instead of the current folder contents.
- Each filename-search result should include an `Open folder` action that:
  - switches back to `Filter` mode
  - navigates to the result's folder
  - pre-fills the local filter with the exact file name so the file is immediately visible
- Entering `Filename` mode must clear any stale bulk-selection or inline-edit state that only makes sense in the folder explorer.

---

## Detailed Tasks

- [ ] **14.1 - Introduce storage-dashboard types and pure helpers**
  - Files:
    - `src/lib/files/types.ts`
    - `src/lib/files/storage-category.ts` (new)
  - Add new types for `StorageDashboardData`, `StorageBreakdownItem`, and `LargestFileItem`.
  - Add a pure `classifyStorageCategory(mimeType)` helper.
  - Category mapping rules:
    - `application/pdf`, text documents, office docs -> `documents`
    - `image/*` -> `images`
    - `video/*` -> `videos`
    - `audio/*` -> `audio`
    - archive/compressed MIME types -> `archives`
    - everything else -> `other`
  - Keep this helper free of DB and React dependencies.
  - Add unit tests before wiring it into queries.

- [ ] **14.2 - Build a dedicated storage-dashboard read model**
  - Files:
    - `src/lib/files/storage-dashboard.ts` (new)
    - `src/app/(dashboard)/files/page.tsx`
    - `src/lib/files/storage-dashboard-query.ts` (new)
    - `src/hooks/use-storage-dashboard-query.ts` (new)
  - Export a focused query function such as `getStorageDashboardData(user)`.
  - Input should include `user.id`, `user.storage_used`, and `user.storage_quota`.
  - Return:
    - `quotaBytes` from `user.storage_quota`
    - `quotaUsedBytes` from `user.storage_used`
    - `activeBytes` and `activeFileCount` from ready, non-deleted files
    - `trashedBytes` and `trashedFileCount` from ready, soft-deleted files
    - `breakdown` from ready, non-deleted files only
    - `largestFiles` from ready, non-deleted files only, top 10 by size descending and `updated_at` descending as a tiebreaker
  - Exclude `uploading` and `failed` files from all dashboard metrics.
  - Compute `usagePercent` in the read model, clamp it to `0..100`, and avoid divide-by-zero.
  - Stop using the current minimal `getStorageUsage()` response on the files page once this read model is in place.
  - Refresh strategy is mandatory:
    - hydrate initial dashboard data from SSR
    - keep it current with a dedicated TanStack Query
  - Quota-changing actions that must refresh dashboard data:
    - upload completion
    - soft delete
    - folder delete
    - trash permanent delete
    - empty trash
  - Update the existing client invalidation points, not just the new dashboard code:
    - `src/components/upload/upload-provider.tsx`
    - `src/components/files/files-library.tsx`
    - `src/components/trash/trash-page-content.tsx`

- [ ] **14.3 - Replace the basic files-page storage card with a real dashboard**
  - Files:
    - `src/components/files/files-page-content.tsx`
    - `src/components/files/storage-overview-card.tsx` (new)
    - `src/components/files/storage-breakdown-card.tsx` (new)
    - `src/components/files/largest-files-card.tsx` (new)
  - Keep the dashboard on the existing files page. Do not create `settings/storage/page.tsx`.
  - Reuse existing UI primitives:
    - `Card`
    - `Progress`
    - `formatFileSize`
  - Required UI:
    - quota progress bar
    - active bytes summary
    - trashed bytes summary with explicit text that trash still counts toward quota
    - category breakdown with bytes, count, and percent
    - largest files list
  - While touching `files-page-content.tsx`, correct any misleading encryption copy so it matches the actual architecture and does not claim client-side encryption if that is not how the app currently works.
  - Zero-state behavior:
    - show cards with meaningful empty content
    - do not hide the dashboard when there are no files

- [ ] **14.4 - Preserve and harden the existing quick filter**
  - Files:
    - `src/components/files/files-library.tsx`
    - `src/components/files/toolbar.tsx`
    - `src/components/files/file-browser-utils.ts`
  - Keep the current local quick-filter behavior.
  - Keep `useDeferredValue` so filtering remains responsive on larger lists.
  - Make the copy explicit that this mode filters the currently loaded explorer items.
  - Ensure the local filter still applies to both files and folders in the current folder only.
  - Do not make API calls in `Filter` mode.
  - Only adjust behavior that is necessary to coexist with global filename search.

- [ ] **14.5 - Implement global filename search backend**
  - Files:
    - `src/lib/search/types.ts` (new)
    - `src/lib/search/filename-search.ts` (new)
    - `src/app/api/search/files/route.ts` (new)
  - Route shape:
    - `GET /api/search/files?q=<term>&limit=<n>`
  - Validation rules:
    - unauthenticated -> `401`
    - blank query after trim -> `400`
    - query length `< 2` -> `400`
    - default `limit = 20`
    - hard cap `limit = 50`
  - Search rules:
    - scope by `userId`
    - only include `files.status = 'ready'`
    - exclude soft-deleted files
    - case-insensitive filename search
    - escape SQL wildcard characters in user input so `%` and `_` are treated as literals unless explicitly intended
  - Ranking rules:
    - exact filename match first
    - prefix match second
    - substring match third
    - newest `updated_at` last as the fallback tiebreaker
  - Result DTO must contain enough data for the UI to render without a second request:
    - `id`
    - `name`
    - `mimeType`
    - `size`
    - `folderId`
    - `updatedAt`
    - `folderPath`
    - `isInRoot`
  - Prefer returning `folderPath` from the backend instead of rebuilding it in multiple UI components.
  - Define `folderPath` explicitly as an ordered array of breadcrumb items, not an opaque string, for example:

```ts
type SearchResultFolderPathItem = {
  id: string;
  name: string;
};
```

  - Avoid N+1 folder lookups while building result paths.
  - Root-level files must be handled explicitly:
    - `folderId = null`
    - `folderPath = []`
    - `isInRoot = true`

- [ ] **14.6 - Add a TanStack Query fetcher and hook for filename search**
  - Files:
    - `src/lib/search/filename-search-query.ts` (new)
    - `src/hooks/use-filename-search-query.ts` (new)
  - Follow the existing pattern used by `files-explorer-query.ts`.
  - Query key must include the normalized query string.
  - Gate the query with `enabled` so no request fires unless:
    - mode is `filename`
    - trimmed query length is at least 2
  - Normalize the query once in the hook or query util, not in multiple components.
  - Use a debounced or deferred search term before firing the query.
  - Ensure stale requests/results do not visibly overwrite newer input.
  - Reuse the existing `AuthError` behavior from `src/lib/files/files-explorer-query.ts` so auth failures are handled consistently.

- [ ] **14.7 - Integrate filename search into the files library**
  - Files:
    - `src/components/files/toolbar.tsx`
    - `src/components/files/files-library.tsx`
    - `src/components/files/file-search-results.tsx` (new)
    - `src/components/files/files-library-header.tsx`
    - `src/components/files/files-empty-state.tsx` or a dedicated search empty-state component
  - Add explicit search mode state:
    - `filter`
    - `filename`
  - Behavior requirements:
    - `filter` remains the default mode
    - `filter` mode uses existing local quick filter only
    - `filename` mode shows helper text when query is blank or too short
    - `filename` mode renders a dedicated search-results surface when data exists
    - `filename` mode renders dedicated empty, loading, and error states
    - entering `filename` mode clears:
      - selected file ids
      - rename state
      - open destructive dialogs
      - other explorer-only transient state that could trigger the wrong action
    - bulk actions must be hidden or disabled while global search results are shown
  - `FileSearchResults` rows must show:
    - file name
    - folder breadcrumb/path
    - size
    - modified date
    - `Open folder` button
  - Root-level search results must render clearly as belonging to `All files` / root.
  - `Open folder` must:
    - switch back to `filter`
    - set `currentFolderId` to the result folder id or `null` for root-level files
    - set the local `filterValue` to the exact file name
    - clear any incompatible search-only state
  - Keep selection, rename, move, and delete behavior unchanged in `filter` mode.
  - Do not try to reuse the folder-grid/list view for global search results if it makes the component harder to reason about. Use a dedicated result component.
  - Update the header and empty-state UX so it is truthful in each mode:
    - folder browsing should keep the existing explorer-oriented copy
    - filename search should not show misleading text like `This folder is empty`
    - result counts shown in the header must reflect the active mode, not always total library file count

- [ ] **14.8 - Leave a clean seam for Phase 19 semantic search**
  - Files:
    - `src/lib/search/types.ts`
    - optionally `src/components/files/toolbar.tsx`
  - If you add shared search-mode types, make them extensible so Phase 19 can add `semantic` without a breaking refactor.
  - Do **not** implement:
    - `/api/search/semantic`
    - `/api/embeddings`
    - vector-search SQL
    - embedding-job processing
  - Add a short code comment where helpful so a future engineer knows semantic search is intentionally deferred to Phase 19.

- [ ] **14.9 - Remove duplication and finish cleanup**
  - Delete or stop using temporary dashboard calculations once the dedicated read model exists.
  - Keep naming consistent between DTOs, hooks, and UI props.
  - Confirm every new module has a single responsibility.
  - Run unit tests and Playwright tests before marking the phase done.

---

## Deliverables

| Output | Location |
| --- | --- |
| Storage category helper | `src/lib/files/storage-category.ts` |
| Storage dashboard read model | `src/lib/files/storage-dashboard.ts` |
| Updated files page loader | `src/app/(dashboard)/files/page.tsx` |
| Storage dashboard UI cards | `src/components/files/storage-*.tsx` |
| Filename search service | `src/lib/search/filename-search.ts` |
| Filename search types | `src/lib/search/types.ts` |
| Filename search route | `src/app/api/search/files/route.ts` |
| Filename search fetcher/hook | `src/lib/search/filename-search-query.ts`, `src/hooks/use-filename-search-query.ts` |
| Storage dashboard fetcher/hook | `src/lib/files/storage-dashboard-query.ts`, `src/hooks/use-storage-dashboard-query.ts` |
| Search results UI | `src/components/files/file-search-results.tsx` |
| Updated toolbar/library search state | `src/components/files/toolbar.tsx`, `src/components/files/files-library.tsx` |

---

## Execution Order

1. Add pure types and helpers first.
2. Implement the storage-dashboard read model and cover it with unit tests.
3. Replace the files-page dashboard UI and verify the zero state.
4. Implement the filename-search service and route with unit and route tests.
5. Add the search hook and integrate it into the files library.
6. Add component tests for filter mode vs filename mode behavior.
7. Add Playwright coverage for end-to-end storage and search flows.
8. Run the full targeted test set and fix any regressions before closing the phase.

---

## Testing

### Automated Unit and Integration Tests (Vitest)

Run at minimum:

```bash
npx vitest run tests/files tests/search tests/services
```

Create or extend the following tests:

| Test file | Coverage |
| --- | --- |
| `tests/files/storage-category.test.ts` | MIME type classification, fallback to `other`, empty/unknown MIME handling |
| `tests/files/storage-dashboard.test.ts` or `tests/services/storage-dashboard.test.ts` | active bytes, trashed bytes, quota percent, zero-state data, breakdown aggregation, largest-files sort order |
| `tests/files/storage-dashboard-query.test.ts` or component coverage in `tests/files/files-page-content.test.tsx` | dashboard refresh after quota-changing mutations |
| `tests/services/file-service.test.ts` | remove or update old `getStorageUsage` expectations if that helper is replaced |
| `tests/search/filename-search.test.ts` | user scoping, deleted exclusion, ready-only filter, ranking exact/prefix/substring, limit cap |
| `tests/search/files-route.test.ts` | `401`, `400`, `200`, and `500` responses |
| `tests/search/filename-search-query.test.ts` | `AuthError` on 401, normalized query keying, gated requests |
| `tests/files/files-library.test.tsx` | default filter mode, no network requests in filter mode, filename mode query gating, debounced request behavior, loading/empty/error states, root-result behavior, open-folder behavior, selection-state reset, truthful header/empty-state copy |
| `tests/files/file-browser-utils.test.ts` | keep existing quick-filter coverage and add any missing edge cases introduced by the UI change |

Required unit/integration assertions:

- Storage dashboard uses `user.storage_used` for quota usage, not the active-file aggregate.
- Active metrics exclude soft-deleted files.
- Trashed metrics include only ready soft-deleted files.
- Dashboard excludes `uploading` and `failed` files.
- Breakdown groups files into the expected categories.
- Largest files are sorted deterministically.
- Dashboard refreshes after quota-changing mutations instead of remaining stuck on initial SSR values.
- Filename search never returns another user's files.
- Filename search never returns soft-deleted files.
- Filename search never returns non-ready files.
- Filename search treats `%` and `_` in user input safely and predictably.
- Root-level search results map back to `currentFolderId = null` correctly.
- Blank and 1-character queries do not hit the search route from the UI.
- Rapid typing does not leave the UI showing stale results for an older query.
- `Filter` mode remains fully local and continues to filter the current folder only.
- Switching from `Filename` back to `Filter` restores the normal explorer state.
- Switching into `Filename` mode clears stale selection and explorer-only transient state.
- Header and empty-state copy remain truthful for both browsing mode and search mode.

### End-to-End Tests (Playwright)

Add a dedicated spec:

```bash
npx playwright test tests/e2e/storage-search.spec.ts
```

Recommended scenarios:

1. **New user zero state**
   - Sign up a fresh user.
   - Open `/files`.
   - Verify storage cards render zero values and no crashes occur.

2. **Dashboard reflects uploads**
   - Upload at least one PDF and one image.
   - Verify quota-used, active-bytes summary, breakdown categories, and largest-files list all update without a manual full-page reload.

3. **Trash still counts toward quota**
   - Upload files.
   - Soft-delete one ready file.
   - Return to `/files`.
   - Verify active bytes decrease, trashed bytes increase, and quota-used does not drop.

4. **Permanent delete reclaims quota**
   - Permanently delete the trashed file from the existing trash UI.
   - Return to `/files`.
   - Verify quota-used and trashed bytes both decrease.

5. **Local filter remains scoped to the current folder**
   - Create nested folders.
   - Put a file in a nested folder.
   - In root view, use `Filter` mode and search for the nested file name.
   - Verify it does not appear in root if it is not in the current folder.

6. **Global filename search works across folders**
   - Switch to `Filename` mode.
   - Search for a file stored in a nested folder.
   - Verify the result appears with its folder path.
   - Click `Open folder`.
   - Verify the app returns to normal browsing mode and the file is visible in that folder.

7. **Short-query behavior**
   - Switch to `Filename` mode.
   - Enter 0 or 1 visible character.
   - Verify no results request is sent and helper text is shown.

8. **Search empty state**
   - Search for a query that matches nothing.
   - Verify a deterministic empty-state message appears.

9. **Rapid query changes**
   - Switch to `Filename` mode.
   - Type a query, then quickly replace it with another valid query.
   - Verify the final rendered results match the latest query, not an earlier response.

### Manual Verification

1. Open `/files` with an existing account and confirm the storage dashboard renders before interacting with the explorer.
2. Upload a PDF, an image, and then soft-delete one file; confirm the dashboard distinguishes active vs trashed bytes.
3. Permanently delete the trashed file from `/trash`; confirm quota-used decreases afterward.
4. In `Filter` mode, search for a visible file name and confirm the local folder contents update instantly.
5. In `Filename` mode, search for a file in a different folder and use `Open folder` to navigate back into the standard explorer.
6. Refresh the page and confirm the normal files explorer still loads with no search-mode regressions.

---

## Definition of Done

- Files page shows a real storage dashboard based on a dedicated read model.
- Existing quick filter still works and remains the default behavior.
- Global filename search works end-to-end through API, hook, and UI.
- Search and storage code follow clear module boundaries and are covered by unit plus e2e tests.
- No semantic-indexing backend work is duplicated from Phase 19.
