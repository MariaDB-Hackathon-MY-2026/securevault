# Phase 8 - Link Sharing & Access Control

> **Objective:** Implement secure share links with expiry, email allowlists, OTP verification, revocation, download limits, and access logging in a way that fits the current Next.js + Drizzle architecture.

**Depends on:** Phase 5 (File Download), Phase 7 (Folder System)  
**No longer blocked by:** Phase 15.0. This phase now includes the minimal email module required for OTP delivery.  
**Blueprint ref:** Section 6 (Link Sharing), Section 15 (Folder Sharing), Section 20 (Application-level scoping)

---

## Why This Plan Changed

When this phase was audited on **2026-04-04**, the repo already had:

- sharing tables in `src/lib/db/schema/sharing.ts`
- file/folder action menus in `src/components/files/*`
- authenticated file streaming in `src/app/api/files/[id]/service.ts`
- proxy routing that knows about `/api/share/:path*`

But it did **not** yet have:

- `sendOTPEmail()` in `src/lib/email/index.ts`
- a public share page at `/s/[token]`
- public share APIs
- schema support for per-email OTP attempts
- schema support for logging verified email on access

Because of that, this phase must be self-sufficient. A junior engineer should be able to complete link sharing from this document without waiting on Phase 15.

---

## Success Criteria

Phase 8 is complete when all of the following are true:

1. A signed-in, verified user can create a share link for a file or folder.
2. Public links work in an incognito browser without requiring the owner to be logged in.
3. Restricted links can require an allowlisted email plus OTP verification.
4. Revoked or invalid links do not leak whether a resource exists.
5. Download limits and expiry are enforced server-side on every access.
6. Successful access is logged with IP, user agent, and verified email when applicable.
7. Folder shares allow safe navigation inside the shared subtree only.

---

## Scope

### In scope

- Public file share links
- Public folder share links
- Expiry
- Download limits
- Email allowlist
- OTP generation and verification
- OTP email delivery
- Revocation
- Access logging
- Owner management UI for creating and revoking links

### Out of scope for this phase

- Bulk ZIP download for folder shares
- Rich access-log analytics UI
- Rate limiting beyond simple OTP attempt enforcement
- Full password reset / verification email flows from Phase 15
- AI-generated sharing flows

---

## Current Codebase Reality

### Already implemented

| Feature | Location |
| --- | --- |
| Sharing tables exist | `src/lib/db/schema/sharing.ts` |
| Sharing relations are exported | `src/lib/db/schema/index.ts` |
| Authenticated file streaming and FEK decryption exist | `src/app/api/files/[id]/service.ts` |
| Authenticated download route exists | `src/app/api/files/[id]/download/route.ts` |
| File explorer uses server actions + React Query | `src/app/(dashboard)/files/actions.ts`, `src/components/files/files-library.tsx` |
| File and folder action menus are available integration points | `src/components/files/file-actions-menu.tsx`, `src/components/files/folder-actions-menu.tsx` |
| Proxy matcher includes `/api/share/:path*` | `src/proxy.ts` |

### Missing or incomplete

| Gap | Why it matters |
| --- | --- |
| `share_link_otps` has no `email` column | OTPs must be tied to a specific requested email |
| `share_link_otps` has no attempt counter | Needed for "max 3 attempts" |
| `share_link_access_logs` has no `email` column | Required to log verified email |
| `share_links.expires_at` is non-null | Conflicts with "never" expiry |
| No email module exists | OTP cannot be delivered |
| `/api/share/:path*` is currently proxy-protected | Public links would get redirected before token validation |
| No public `/s/[token]` route exists | Main user flow is missing |

---

## Recommended Architecture

Use a **two-lane model**:

- **Owner lane**
  - signed-in user
  - dashboard UI
  - server actions for create/revoke
  - authenticated GET routes for management data
- **Public lane**
  - anonymous visitor
  - `/s/[token]`
  - public `/api/share/...` routes
  - no session cookie required
  - access granted purely by share token + restrictions

### Key rule

A share link is a **separate access model** from authenticated file ownership. Never reuse owner session requirements for public share access.

### Recommended module layout

| Responsibility | File |
| --- | --- |
| Email sending | `src/lib/email/index.ts` |
| Email HTML templates | `src/lib/email/templates.ts` |
| Share link business rules | `src/lib/sharing/share-service.ts` |
| OTP business rules | `src/lib/sharing/otp-service.ts` |
| Verified share-access cookie | `src/lib/sharing/share-access-session.ts` |
| Share owner mutations | `src/app/(dashboard)/files/share-actions.ts` |
| Share management read API | `src/app/api/share/links/route.ts` |
| Public OTP routes | `src/app/api/share/[token]/request-otp/route.ts`, `src/app/api/share/[token]/verify-otp/route.ts` |
| Public file access routes | `src/app/api/share/[token]/download/route.ts`, `src/app/api/share/[token]/preview/route.ts` |
| Public page | `src/app/s/[token]/page.tsx` |
| Owner UI dialog | `src/components/share/create-share-dialog.tsx` |
| Owner UI list | `src/components/share/share-links-list.tsx` |

---

## Important Product Decisions

These choices should be implemented exactly unless product requirements change.

### Link target rules

- A share link must target **exactly one** of:
  - `file_id`
  - `folder_id`
- If both are missing: reject create request
- If both are present: reject create request

### Public vs restricted rules

- If `allowedEmails` is empty, the link is public
- If `allowedEmails` contains at least one email, the link is restricted
- Do not allow a configuration that is both:
  - `isPublic === true`
  - `allowedEmails.length > 0`

### Expiry rules

- Supported choices:
  - `1h`
  - `24h`
  - `7d`
  - `30d`
  - `never`
- Store `expires_at = null` for "never"
- Expiry is checked on:
  - page view
  - OTP request
  - OTP verify
  - preview
  - download

### Download counting rules

- Increment `download_count` only when a real file download is authorized and about to stream
- Do not increment on:
  - page load
  - preview page render
  - OTP request
  - OTP verification

### Access logging rules

- Log on successful restricted unlock
- Log on successful preview/download access
- Include verified email only if the visitor actually passed email verification

### Folder navigation rules

- Shared folder browsing must stay inside the shared root subtree
- Use folder IDs in the `path` query value, not folder names
- Example:
  - `/s/abc123?path=folderA/folderB`
- Every path segment must be validated as a descendant of the shared root

---

## Implementation Order

Follow this order. It reduces rework and keeps public access safe.

1. Build the minimal email module needed for OTP
2. Align the sharing schema
3. Build share and OTP services
4. Build verified share-access cookie handling
5. Add owner create/revoke/list flows
6. Add public file-link page and routes
7. Reuse the decryption/streaming pipeline for public share access
8. Add folder sharing
9. Add logging and finish tests

---

## Detailed Tasks

### 8.0 - Build the minimal email module needed for OTP

This phase must no longer assume Phase 15 has already created email utilities.

- [ ] Create `src/lib/email/index.ts`
  - Export `sendEmail(to, subject, html)`
  - Export `sendOTPEmail(to, code)`
- [ ] Create `src/lib/email/templates.ts`
  - Export `otpEmailHtml(code)`
- [ ] Keep this email implementation intentionally narrow
  - only what Phase 8 needs
  - password reset and verification templates can still arrive in Phase 15 later

#### Implementation notes

- Choose one provider:
  - `Resend` is preferred if available
  - fallback can be SMTP if the repo already standardizes on it later
- Add environment variable notes to this phase:
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
- `sendEmail()` should throw a normal server error if delivery fails
- `sendOTPEmail()` should:
  - render `otpEmailHtml(code)`
  - call `sendEmail()`

#### Minimum template requirements

- simple HTML layout
- project name / branding
- OTP code in large monospace text
- short validity note: "This code expires in 5 minutes"
- ignore-if-not-requested footer

#### Why build this now

Without this module, the OTP service cannot be completed or tested. Phase 15 can later extend this same module instead of replacing it.

---

### 8.1 - Align the sharing schema with the required behavior

- [ ] Update `src/lib/db/schema/sharing.ts`
  - make `share_links.expires_at` nullable
  - add `email` to `share_link_otps`
  - add `attempt_count` to `share_link_otps`
  - add nullable `email` to `share_link_access_logs`
  - add index on `share_links.folder_id`
  - add uniqueness guard for allowlist emails if practical
- [ ] Generate Drizzle migration
- [ ] Review migration carefully before apply

#### Expected table behavior

##### `share_links`

- `id`
- `file_id` nullable
- `folder_id` nullable
- `created_by`
- `token`
- `expires_at` nullable
- `max_downloads` nullable
- `download_count`
- `is_public`
- `revoked_at`
- `created_at`

##### `share_link_otps`

- `id`
- `link_id`
- `email`
- `otp_hash`
- `attempt_count`
- `expires_at`
- `used_at`
- `created_at`

##### `share_link_access_logs`

- `id`
- `link_id`
- `ip_address`
- `user_agent`
- `email` nullable
- `accessed_at`

#### Service-level validations

Even if MariaDB does not enforce everything with constraints, the service layer must enforce:

- exactly one of `file_id` / `folder_id`
- owner must own target
- target must not be deleted

---

### 8.2 - Build the share service

- [ ] Create `src/lib/sharing/share-service.ts`

#### Primary responsibilities

- create links
- fetch link by token
- list links for a file or folder owner
- revoke links
- validate token state
- log access
- increment downloads

#### Recommended public functions

- `createShareLink(input)`
- `getShareLinkByToken(token)`
- `listShareLinksForOwner(input)`
- `revokeShareLink(input)`
- `assertShareLinkAccessible(link)`
- `recordShareAccess(input)`
- `incrementDownloadCount(input)`

#### `createShareLink(input)` contract

Input should include:

- `createdBy`
- `fileId?`
- `folderId?`
- `expiresAt: Date | null`
- `maxDownloads: number | null`
- `allowedEmails: string[]`

Behavior:

- validate exactly one target
- validate owner owns target
- normalize emails to lowercase + trim
- remove duplicates
- create a `nanoid(32)` token
- insert link row
- insert allowlist rows
- return:
  - `id`
  - `token`
  - `url`
  - `expiresAt`
  - `maxDownloads`
  - `downloadCount`
  - `isPublic`
  - `allowedEmails`

#### `getShareLinkByToken(token)` should return enough data for both page rendering and route access

Recommended shape:

- link metadata
- target type: `file` or `folder`
- target IDs
- owner ID
- allowlist emails
- revoked state
- expiry state

#### Error handling rules

- invalid token -> behave like not found
- revoked link -> behave like not found
- expired link -> distinct expired state is acceptable on page render, but APIs should still avoid leaking target details

---

### 8.3 - Build the OTP service

- [ ] Create `src/lib/sharing/otp-service.ts`

#### Responsibilities

- generate OTP
- store hashed OTP
- send OTP email
- verify OTP
- track attempts
- mark OTP as used

#### OTP rules

- 6 digits
- numeric only
- expires in 5 minutes
- max 3 failed attempts
- scoped to `link_id + email`
- old unused OTP rows for same `link_id + email` should be invalidated when a new OTP is created

#### Recommended functions

- `generateOtpCode()`
- `hashOtp(code)`
- `createAndSendOtp({ linkId, email })`
- `verifyOtp({ linkId, email, code })`

#### `createAndSendOtp({ linkId, email })`

Behavior:

- confirm link exists and is still active
- confirm email is in allowlist
- invalidate previous unused OTP rows for the same link/email
- create new OTP row with:
  - `attempt_count = 0`
  - `expires_at = now + 5 minutes`
- send email through `sendOTPEmail(email, code)`

#### `verifyOtp({ linkId, email, code })`

Behavior:

- find latest unused OTP for `linkId + email`
- reject if no active OTP exists
- reject if expired
- reject if attempts already >= 3
- compare stored hash
- if wrong:
  - increment attempts
  - reject
- if correct:
  - set `used_at`
  - return success

#### Recommended user-facing behavior

- do not reveal allowlist contents
- "We sent a code if this email is allowed" is safer than explicit enumeration
- but once the visitor is already inside the restricted-link flow, a clear "This email is not allowed for this link" message is acceptable if product prefers it

---

### 8.4 - Build verified share-access session handling

- [ ] Create `src/lib/sharing/share-access-session.ts`

#### Why this is needed

After OTP passes, the visitor needs a short-lived proof that they already verified access. That proof should not live only in React state, because preview/download routes run on the server.

#### Recommended design

- use a signed, `httpOnly` cookie
- cookie scope should be narrow
- cookie should include:
  - `linkId`
  - `email`
  - `verifiedAt`
  - `expiresAt`

#### Recommended helper functions

- `createShareAccessSession({ linkId, email })`
- `readShareAccessSession(linkId)`
- `clearShareAccessSession(linkId)`

#### Rules

- session TTL should not exceed the link expiry
- if link expires, session becomes invalid
- if link is revoked, session becomes invalid
- if cookie payload is invalid or tampered, treat as no session

---

### 8.5 - Add owner management flows

- [ ] Create `src/app/(dashboard)/files/share-actions.ts`
- [ ] Create `src/app/api/share/links/route.ts`

#### Owner mutations

Implement server actions for:

- `createShareLinkAction(...)`
- `revokeShareLinkAction(...)`

#### Action rules

- require signed-in user
- require verified email using `requireVerifiedUser()`
- validate inputs
- call share service
- revalidate `/files`

#### Owner read route

`GET /api/share/links`

Supported query params:

- `fileId`
- `folderId`

Rules:

- exactly one must be provided
- require signed-in user
- return only links owned by the current user for that target

---

### 8.6 - Update the proxy for public share access

- [ ] Update `src/proxy.ts`

#### Required change

Remove `/api/share/:path*` from the proxy matcher.

#### Why

The proxy currently redirects unauthenticated requests to `/login`. Public share APIs must be reachable by anonymous users.

#### Also review

- `/shared/:path*` currently exists in the matcher even though the share page design uses `/s/[token]`
- remove or rename stale matcher entries if they are no longer needed

---

### 8.7 - Add public share APIs

- [ ] Create:
  - `src/app/api/share/[token]/request-otp/route.ts`
  - `src/app/api/share/[token]/verify-otp/route.ts`
  - `src/app/api/share/[token]/download/route.ts`
  - `src/app/api/share/[token]/preview/route.ts`

#### Route contract: `POST /api/share/[token]/request-otp`

Request body:

```json
{ "email": "user@example.com" }
```

Behavior:

- validate token
- reject invalid, revoked, or expired links
- reject public links because they do not need OTP
- normalize email
- create and send OTP

Response recommendation:

- `200` with generic success message
- avoid leaking too much detail about allowlist membership

#### Route contract: `POST /api/share/[token]/verify-otp`

Request body:

```json
{ "email": "user@example.com", "code": "123456" }
```

Behavior:

- validate token
- verify OTP
- create share-access session cookie
- log successful restricted unlock

Response recommendation:

- `200` with `{ success: true }`

#### Route contract: `GET /api/share/[token]/download`

Behavior:

- validate token
- check expiry/revocation
- check target exists
- check download limit
- if restricted link, require valid share-access session cookie
- stream file
- increment download count
- log access

#### Route contract: `GET /api/share/[token]/preview`

Same as download, except:

- set inline disposition
- only allow previewable MIME types

---

### 8.8 - Reuse the existing decryption/streaming pipeline

- [ ] Refactor `src/app/api/files/[id]/service.ts`

#### Goal

Do not duplicate the chunk decryption logic.

#### Recommended refactor

Split the existing service into:

- low-level file-stream preparation logic
- owner-auth wrapper for current authenticated routes
- share-link wrapper for public routes

#### Public share stream flow

1. Resolve share link from token
2. Resolve target file
3. Load owner user record
4. Decrypt owner's UEK
5. Use existing FEK + chunk metadata flow
6. Stream response

#### Important note for a junior engineer

The public visitor does **not** have the owner's session. That is okay. The server can still decrypt the owner's UEK from the database because that is how the app already handles server-side file access.

---

### 8.9 - Build the owner-facing share UI

- [ ] Add "Share" entry point to:
  - `src/components/files/file-actions-menu.tsx`
  - `src/components/files/folder-actions-menu.tsx`
- [ ] Create `src/components/share/create-share-dialog.tsx`
- [ ] Create `src/components/share/share-links-list.tsx`

#### Dialog requirements

Inputs:

- expiry selector
- max downloads
- allowlist emails
- public/restricted selection

Outputs:

- newly created public URL
- copy button
- current list of existing links for this target

#### Validation rules

- max downloads must be positive integer or empty
- emails must be normalized
- duplicate emails removed
- if allowlist has emails, disable or override the public toggle

#### Existing links list should show

- target type
- created date
- expiry
- revoked status
- downloads used / max
- restricted vs public
- revoke button

---

### 8.10 - Build the public page at `/s/[token]`

- [ ] Create `src/app/s/[token]/page.tsx`

#### Page states

The page should render one of these states:

1. invalid or revoked -> `notFound()`
2. expired -> expired message page
3. restricted and not yet verified -> email + OTP flow
4. valid file share -> preview/download UI
5. valid folder share -> folder listing UI

#### Recommended page structure

- top-level share header
- status card for invalid/expired
- restricted access panel
- file viewer panel
- folder browser panel

#### Keep the OTP flow on the same page for MVP

Recommended interaction:

- visitor enters email
- app calls `request-otp`
- app shows code input
- visitor enters code
- app calls `verify-otp`
- page refreshes or refetches state
- protected content becomes visible

Using one page is simpler than splitting into `/verify`.

---

### 8.11 - Add folder sharing

- [ ] Extend share service to support folder targets
- [ ] Reuse the same public page and public routes

#### Folder page requirements

- show current folder name
- show subfolders
- show files
- show breadcrumb
- allow navigation deeper
- allow per-file preview/download
- mobile friendly layout

#### Required query behavior

Recommended URL:

```text
/s/[token]?path=folderA/folderB
```

Where each path segment is a **folder ID** relative to the shared root.

#### Validation steps for `path`

1. Start with the shared root folder
2. For each folder ID in `path`
3. Confirm that folder exists
4. Confirm its parent chain stays inside the shared subtree
5. If any step fails, return not found or access denied state

#### Important simplification for MVP

- no ZIP download
- no recursive bulk download
- only per-file actions

---

### 8.12 - Implement access logging and counters

- [ ] Add access logging to successful flows
- [ ] Increment download count for successful downloads

#### Log on these events

- successful restricted unlock
- successful preview
- successful download

#### Logged data

- `link_id`
- `ip_address`
- `user_agent`
- `email` when verified
- `accessed_at`

#### Counter logic

Before streaming:

- if `max_downloads` is null -> allow
- if `download_count < max_downloads` -> allow
- otherwise reject

After authorization and before stream response:

- increment `download_count`

---

## Error Handling Rules

Keep behavior consistent so users understand what happened and attackers learn as little as possible.

| Scenario | Recommended behavior |
| --- | --- |
| Random token | `404` |
| Revoked token | `404` |
| Expired token on page | friendly expired page |
| Expired token on API access | `410` or `403`, but do not leak target details |
| Wrong OTP | show invalid code message |
| OTP expired | show expired code message and allow resend |
| OTP attempts exceeded | show locked message and require new OTP |
| Download limit reached | blocked message |
| Folder path escape attempt | `404` |

---

## Deliverables

| Output | Location |
| --- | --- |
| Email sender | `src/lib/email/index.ts` |
| Email template | `src/lib/email/templates.ts` |
| Sharing schema updates | `src/lib/db/schema/sharing.ts` |
| Share service | `src/lib/sharing/share-service.ts` |
| OTP service | `src/lib/sharing/otp-service.ts` |
| Share-access session helper | `src/lib/sharing/share-access-session.ts` |
| Share actions | `src/app/(dashboard)/files/share-actions.ts` |
| Share links API | `src/app/api/share/links/route.ts` |
| Public OTP APIs | `src/app/api/share/[token]/request-otp/route.ts`, `src/app/api/share/[token]/verify-otp/route.ts` |
| Public file APIs | `src/app/api/share/[token]/download/route.ts`, `src/app/api/share/[token]/preview/route.ts` |
| Share dialog | `src/components/share/create-share-dialog.tsx` |
| Share links list | `src/components/share/share-links-list.tsx` |
| Public share page | `src/app/s/[token]/page.tsx` |

---

## Testing Plan

### Automated

```bash
npx vitest run tests/sharing
```

Recommended test files:

- `tests/sharing/email.test.ts`
- `tests/sharing/share-service.test.ts`
- `tests/sharing/otp-service.test.ts`
- `tests/sharing/share-routes.test.ts`
- `tests/sharing/share-page.test.tsx`
- `tests/auth/proxy.test.ts`

### Minimum automated coverage

| Test | Expected |
| --- | --- |
| Create public file share | link created |
| Create restricted file share | allowlist stored |
| Create folder share | folder link created |
| Reject invalid create with both target IDs | validation error |
| Request OTP for allowed email | OTP stored, email sender called |
| Wrong OTP increments attempts | attempts increase |
| Wrong OTP 3 times | locked |
| Expired OTP | rejected |
| Correct OTP | success + access session cookie created |
| Public file download with valid token | streams bytes |
| Restricted file download without cookie | denied |
| Restricted file download after OTP | succeeds |
| Expired share link | blocked |
| Revoked share link | `404` |
| Download limit reached | blocked |
| Folder share path outside subtree | blocked |
| Access log created on success | DB row exists |
| Proxy no longer protects public share API | matcher updated |

### Manual verification

1. Create a public file link and open it in an incognito window.
2. Create a restricted file link, request OTP, and verify it unlocks correctly.
3. Enter a wrong OTP three times and confirm the current OTP becomes unusable.
4. Revoke a link and confirm the public URL now fails.
5. Create a download-limited link and confirm the final allowed download works while the next one fails.
6. Share a folder, navigate into a nested subfolder, and confirm navigation never escapes the shared root.

---

## Notes for Future Phase 15 Work

Phase 15 should **reuse** the email module introduced here, not replace it.

When Phase 15 begins:

- keep `src/lib/email/index.ts`
- keep `src/lib/email/templates.ts`
- add:
  - `sendPasswordResetEmail()`
  - `sendVerificationEmail()`
  - `resetEmailHtml()`
  - `verifyEmailHtml()`

That keeps Phase 8 and Phase 15 aligned instead of creating two competing email implementations.
