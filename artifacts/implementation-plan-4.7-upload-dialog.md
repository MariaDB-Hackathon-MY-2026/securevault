# Phase 4.7 Implementation Plan: Upload Dialog Integrated With 4.6.1 Queue Provider

## Summary

Implement the upload UI as the first real consumer of the shared queue from 4.6.1, not as a standalone modal. The Files page should host both a controlled `UploadDialog` and a lightweight page-level queue summary that consume the same `useUploadQueue()` state from the app-wide `UploadQueueProvider`, so uploads remain visible and controllable even when the dialog closes.

This plan keeps Phase 4.7 production-ready: one queue, one source of truth, shared state across components, verified-user gating, and test coverage aimed at real regressions rather than only happy-path rendering.

## Implementation Changes

### 1. Files page and 4.6.1 integration

- Update `files-page-content.tsx` to become the upload entry surface instead of a placeholder-only page.
- Add a primary `Upload files` trigger in the page header and keep the current dashboard header pattern.
- Add a compact page-level `UploadQueueSummary` block on the Files page that reads from `useUploadQueue()` and shows:
  - total queued and in-progress uploads
  - completed and failed counts when present
  - quick reopen action for the dialog
- Keep the app-level provider in `providers.tsx` as the single source of truth; do not add a second provider in the Files subtree.
- Use the shared queue hook in both the page summary and dialog so Phase 4.6.1 is fully exercised by real UI consumers.

### 2. Upload dialog behavior

- Build `src/components/upload/upload-dialog.tsx` as a controlled client component with:
  - `open`
  - `onOpenChange`
  - `disabled`
  - `disabledReason`
- Use `react-dropzone` for drag-and-drop and browse selection.
- Configure accepted file types from existing upload constants so UI filtering matches backend intent.
- Empty state should show:
  - accepted file categories
  - 100 MB per-file limit
  - note that uploads continue after closing the dialog
- Queue list should be driven entirely by `useUploadQueue()` and render one row per upload with:
  - file name
  - human-readable file size
  - progress bar and percentage
  - status badge or text
  - context-aware actions: pause, resume, cancel, remove
  - stable error copy for failed items
- Desktop layout should use the existing dialog/card visual language; mobile should switch to near full-screen modal treatment.

### 3. Queue and action hardening required for full UI functionality

- Expand `UploadJob` and `UploadManager` behavior so the UI action set is fully supported:
  - queued -> `cancelUpload` immediately marks `cancelled`
  - uploading and pausing -> cancel after the current chunk
  - paused -> `cancelUpload` immediately marks `cancelled`
  - failed -> `resumeUpload` allowed, `removeUpload` allowed
  - success and cancelled -> `removeUpload` allowed
- Keep `removeUpload` blocked for live jobs.
- Preserve existing 3-file global concurrency and 1-chunk-per-file behavior.
- Reopening the dialog or rendering multiple consumers must always reflect the same shared queue snapshot.

### 4. Security and UX constraints

- Gate the upload trigger in the Files page when `email_verified` is false and keep the existing notice visible.
- Back up UI gating by switching upload routes to verified-user auth, so upload access is enforced server-side.
- Keep client-side MIME and type filtering advisory only; server-side MIME detection remains authoritative.
- Do not add client-side file preview, content reads, or duplicate blob buffering.
- Use `StatusNotice` for persistent workflow-blocking states and reserve toasts for discrete async milestones only if added later.
- Render server error messages conservatively; never expose stack traces, raw DB messages, or internal identifiers.

## Public Interfaces

- `UploadDialog` props:
  - `open: boolean`
  - `onOpenChange: (open: boolean) => void`
  - `disabled?: boolean`
  - `disabledReason?: string`
- Optional presentational helper:
  - `UploadQueueSummary` with no external business logic, consuming `useUploadQueue()` internally or receiving derived data from the page component.
- `useUploadQueue()` API shape stays unchanged.
- Upload routes keep current request and response contracts; only auth precondition tightens to verified users.

## Comprehensive Testing Strategy

### Core feature coverage

- Component tests for the dialog:
  - opens from Files page trigger
  - closes without cancelling active uploads
  - accepts multi-file drop and browse selection
  - renders queue rows with name, size, progress, status, and actions
  - shows empty state before files are added
- Provider integration tests:
  - Files page summary and dialog share the same queue state
  - actions taken in the dialog update the summary immediately
  - reopening the dialog shows the live queue snapshot
  - multiple consumers under the same app provider stay synchronized
- Queue behavior tests:
  - max 3 active files globally, additional files remain queued
  - pause stops after current chunk
  - resume continues from uploaded chunks
  - queued cancel works before upload start
  - paused cancel works without restarting upload
  - remove only works for terminal states

### Edge cases

- Unverified user:
  - upload trigger disabled
  - dialog cannot be opened from the primary action path
  - server still rejects upload API access if called directly
- Validation and limits:
  - unsupported file type rejected by UI filter
  - oversized file surfaced clearly before or during init failure
  - duplicate filenames in the same batch create separate client jobs but reuse or dedup correctly server-side when appropriate
- Empty and mixed queue states:
  - all terminal uploads removed leaves clean empty state
  - mixed queued, uploading, failed, success rows render correct actions
  - failed upload keeps readable error and can be resumed or removed
- Lifecycle:
  - dialog unmount does not unsubscribe the app provider or lose queue state
  - strict mode remount does not duplicate subscriptions
  - rapid manager notifications converge to the latest snapshot without stale UI

### Production bug regression coverage

- Shared-state regressions:
  - no duplicate queue instances when two upload consumers render
  - no React-owned shadow state that diverges from manager snapshot
- Action regressions:
  - cancelling a queued file does not accidentally start it
  - removing an active upload is ignored safely
  - pausing while the last chunk finishes ends in a correct terminal state
- Race and retry regressions:
  - 409 chunk-already-uploaded still progresses resumable jobs
  - 429 responses trigger backoff and do not spam state transitions
  - repeated `resume` clicks do not start duplicate upload loops
  - rapid `pause` then `cancel` resolves deterministically
- Error-handling regressions:
  - init, status, chunk, and complete failures surface stable user-facing error text
  - closing the dialog during failure does not swallow terminal state
  - failed jobs remain inspectable and removable after reopen
- Security regressions:
  - unverified-user API rejection path covered at route level
  - no raw backend error leakage in rendered UI
  - client accept list cannot bypass server MIME enforcement

### Manual verification

- Verified user uploads 1 small file and 4 files together; only 3 start immediately.
- Close dialog mid-upload and reopen; progress and actions are preserved.
- Pause, resume, cancel, and remove from both the dialog and page summary flow.
- Try upload as an unverified user; UI blocks it and API remains blocked.
- Force one failed upload and verify the rest of the queue continues unaffected.

## Assumptions and Defaults

- `react-dropzone` is introduced for Phase 4.7.
- The Files page gets a small persistent queue summary now so 4.6.1 is exercised beyond the modal.
- Completed and cancelled jobs remain visible until removed.
- File explorer refresh after successful upload is out of scope until Phase 6 file listing exists.
- The design follows the existing auth/dashboard system exactly: mono-first, sharp shell, rounded inner modules, compact controls, restrained motion.
