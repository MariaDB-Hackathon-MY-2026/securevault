---
title: Feature Tour
description: Product-facing tour of SecureVault features and the architecture choices that make them credible.
---

# Feature Tour

SecureVault is built as a full secure-storage workflow, not a single upload form. Each feature below has two parts:

- what the user or reviewer can see in the product
- why the underlying architecture is production-facing and able to grow

## Account Access And Recovery

### What users get

- Signup and login pages with secure session handling.
- Password reset through email OTP instead of direct password links.
- Session invalidation after a successful password reset.
- Account settings for profile and password management.

### Why the architecture is strong

- Passwords are hashed with Argon2 rather than stored directly.
- Session and refresh tokens are stored hashed in MariaDB.
- Auth cookies are `httpOnly`, `sameSite=strict`, and `secure`.
- Password reset OTPs are hashed, time-limited, attempt-limited, and consumed transactionally.
- The reset flow returns privacy-preserving generic responses so attackers cannot easily confirm whether an email exists.

This is production-facing because the auth model treats session state, recovery state, and token handling as durable security workflows instead of temporary UI state.

## File Uploads

### What users get

- Large files upload through a resumable chunked workflow.
- Upload progress remains visible in a central queue.
- Users can pause, resume, cancel, retry, and remove uploads.
- Completed uploads become available in the file library without blocking on optional AI indexing.

### Why the architecture is strong

- The browser splits files into 5 MiB chunks.
- The server creates upload sessions in MariaDB so incomplete uploads can be resumed.
- Redis coordinates active upload slots so a user cannot overload the system with unlimited parallel uploads.
- Every stored chunk is encrypted before being written to Cloudflare R2.
- Upload finalization validates that the expected chunk set exists before marking the file ready.
- Stale upload cleanup exists through cron.

This is scalable because upload work is split into bounded chunks, coordination is explicit, and object storage carries the large byte payloads while MariaDB stores the authoritative state.

## File Workspace

### What users get

- A dashboard file explorer with folders.
- Rename, move, delete, preview, and download actions.
- Bulk selection and bulk actions.
- Grid/list browsing controls.
- Breadcrumb navigation.
- Filename search.

### Why the architecture is strong

- File and folder metadata is scoped by user in MariaDB.
- Server actions handle authenticated mutations such as rename, move, folder creation, and soft delete.
- Explorer reads are separated from mutation paths so UI state can update optimistically while server rules remain authoritative.
- Folder moves prevent invalid destination choices such as moving a folder into its own subtree.
- Download and preview routes verify ownership before decrypting and streaming bytes.

This is production-facing because the workspace is modeled as durable hierarchical state with owner-scoped authorization, not as a front-end-only file list.

## Preview And Download

### What users get

- Owned files can be previewed inline when supported.
- Owned files can be downloaded as attachments.
- The UI reports download progress and handles failure states.

### Why the architecture is strong

- The app never exposes raw R2 object keys to the browser.
- Preview and download routes repeat current-user ownership checks before reading bytes.
- File chunks are decrypted server-side only after authorization succeeds.
- Download traffic is rate-limited.
- Response headers distinguish inline preview from attachment download.

This scales better than direct bucket links because the app keeps authorization, auditing, decryption, and response policy inside the application boundary.

## Public And Restricted Sharing

### What users get

- Owners can create share links for files or folders.
- Links can be public or restricted to specific email addresses.
- Restricted visitors unlock access with an OTP.
- Owners can edit, revoke, and limit links.
- Download caps protect shared files from unlimited repeated access.

### Why the architecture is strong

- Share links live in MariaDB with explicit target, expiry, restriction, and revocation state.
- Restricted links use an allowlist table plus OTP state.
- OTP request and verification routes are rate-limited.
- Share access sessions are separate from normal signed-in user sessions.
- Download routes enforce token validity, restricted-session validity, folder scope, and download limits before streaming bytes.
- Access events are logged for owner visibility.

This is production-facing because sharing is treated as a governed access model instead of a static public URL.

## Shared Folder Browsing

### What users get

- A shared folder link can expose a navigable folder subtree.
- Visitors can browse allowed child folders and files.
- Folder shares can still use public or restricted access modes.

### Why the architecture is strong

- The share root defines the maximum allowed scope.
- Child folder and file requests are validated against the shared subtree.
- Folder browsing, preview, and download each repeat access checks.
- Restricted access sessions apply across the shared folder experience without becoming normal account sessions.

This is scalable because folder shares reuse the same ownership and hierarchy model as the dashboard while adding token-scoped boundaries for visitors.

## Secure Shared PDF Preview

### What users get

- Shared PDFs can be previewed as rendered page images.
- Visitors do not receive the original PDF for inline viewing.
- Shared pages use deterrents against casual right-click saving and inspection.

### Why the architecture is strong

- The shared PDF manifest route validates token, expiry, restricted access, and folder scope.
- Page routes repeat authorization before any cache lookup.
- Poppler renders PDF pages server-side.
- Rendered pages are served as `image/webp`.
- Redis stores short-lived hot page responses.
- R2 stores encrypted durable rendered derivatives.
- Browser responses remain `Cache-Control: private, no-store`.

This is production-facing because the preview architecture separates authorized viewing from original-file distribution, while still being honest that screenshots cannot be technically prevented.

## Storage Dashboard

### What users get

- Quota visibility.
- Active storage and trash storage summaries.
- Category-level breakdowns.
- Largest-file visibility.

### Why the architecture is strong

- Storage usage is grounded in file metadata and user quota counters.
- Trash and active files are represented separately.
- Largest-file and category summaries come from server-side queries rather than client-side guesses.
- The dashboard gives users operational feedback before they hit storage limits.

This is scalable because quota state and analytics are derived from durable relational data, which can later support billing tiers, admin reporting, or team-level storage policies.

## Trash And Recovery

### What users get

- Deleted files and folders move to trash first.
- Users can restore items.
- Users can permanently delete individual items or empty trash.
- The app handles folder subtree deletion and restoration rules.

### Why the architecture is strong

- Trash uses soft deletion rather than immediate object destruction.
- Folder deletion cascades through descendants.
- Restore flows account for parent-folder dependencies.
- Permanent delete removes metadata, share links in scope, and stored R2 objects.
- Cleanup cron can purge expired trash after the retention window.

This is production-facing because recovery, retention, and permanent deletion are separate states with different rules.

## Activity Timeline

### What users get

- A timeline of important account events.
- Upload completion entries.
- Share creation and revocation entries.
- Shared access entries.
- Activity remains understandable even when a target file has later been deleted.

### Why the architecture is strong

- Activity is stored separately from transient UI notifications.
- Cursor handling supports paginated reads.
- Share access logging feeds the same product-level audit story.
- Activity records are designed to stay readable after lifecycle changes.

This matters because operational storage products need an audit-style history, especially when sharing and deletion are part of the workflow.

## Semantic Search

### What users get

- Optional semantic indexing for eligible PDFs and images.
- Search by meaning, not only exact filename.
- Retry and re-index actions when indexing fails or needs to be refreshed.
- Normal uploads remain usable even when indexing is disabled or unavailable.

### Why the architecture is strong

- Semantic indexing is feature-gated by environment.
- Eligibility rules prevent expensive work on unsupported files.
- Jobs are tracked in MariaDB.
- Inline and queued execution modes are supported.
- Query and chunk vectors live alongside the product's relational state.
- Search is scoped to the current user before returning results.

This is scalable because AI is an additive subsystem with job state, retries, and provider boundaries instead of being tangled into the core upload success path.

## The Product Story In One Line

SecureVault combines secure file storage, controlled sharing, lifecycle management, auditability, and optional AI search through architecture that keeps durable state in MariaDB, large encrypted bytes in R2, coordination in Redis, and sensitive authorization checks on the server.

