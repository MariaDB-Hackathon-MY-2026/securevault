# Phase 8 — Link Sharing & Access Control

> **Objective:** Implement secure share links with expiry, email allowlists, OTP verification, revocation, and access logging.

**Depends on:** Phase 5 (Download), Phase 7 (Folders — for folder sharing), Phase 15.0 (Email service)  
**Blueprint ref:** Section 6 (Link Sharing), Section 15 (Folder Sharing)

---

## Tasks

- [ ] **8.1 — Implement share link service**
  - File: `src/lib/services/share-service.ts`
  - `createShareLink(fileId, options)` — generates nanoid(32) token, stores in DB
  - Options: `expiresAt`, `maxDownloads`, `isPublic`, `allowedEmails[]`
  - `getShareLink(token)` — validates token, checks expiry/revocation
  - `revokeShareLink(linkId)` — sets `revoked_at`
  - `listShareLinks(fileId)` — returns all links for a file

- [ ] **8.2 — Implement OTP service**
  - File: `src/lib/services/otp-service.ts`
  - `generateOTP(shareLinkId, email)` — 6-digit code, hashed with SHA-256, stored in DB, 5 min TTL
  - `verifyOTP(shareLinkId, email, code)` — hash comparison, max 3 attempts
  - `sendOTP(email, code)` — sends via email service

- [ ] **8.3 — Verify email service integration** _(email service built in Phase 15.0)_
  - Verify `src/lib/email/index.ts` has `sendOTPEmail(to, code)`
  - The email service and HTML templates are created in Phase 15 task 15.0
  - This phase only needs to call `sendOTPEmail()` from the OTP service

- [ ] **~~8.3b~~ — Email templates** _(covered by Phase 15.0)_
  - Templates already created in Phase 15 task 15.0 (`src/lib/email/templates.ts`)
  - No additional work needed here

- [ ] **8.4 — Build share link creation UI**
  - File: `src/components/share/create-share-dialog.tsx`
  - Form: expiry selector (1h, 24h, 7d, 30d, never), email allowlist input, max downloads, public toggle
  - Copy link button
  - Shows existing share links for this file

- [ ] **8.5 — Build share link viewer page**
  - File: `src/app/s/[token]/page.tsx`
  - Access flow per Section 6 flowchart:
    1. Check link exists + not revoked → 404 if invalid
    2. Check expiry → show "Link Expired" if expired
    3. If email allowlist → prompt for email → send OTP → verify
    4. If public → serve file directly
  - Download/preview buttons

- [ ] **8.6 — Build OTP verification page**
  - File: `src/app/s/[token]/verify/page.tsx` (or modal)
  - Email input → OTP code input (6 digits)
  - Shows attempts remaining
  - Lockout after 3 failed attempts

- [ ] **8.7 — Implement access logging**
  - On every successful share link access: insert into `share_link_access_logs`
  - Record: IP, email (if verified), timestamp

- [ ] **8.8 — Implement download counter**
  - Increment `share_links.download_count` on each download
  - If `download_count >= max_downloads` → deny access

- [ ] **8.9 — Build share link management UI**
  - File: `src/components/share/share-links-list.tsx`
  - Shows all share links for a file: token (truncated), status, downloads, expiry
  - Revoke button per link
  - Access log viewer per link

- [ ] **8.10 — Extend sharing to folders**
  - Allow `createShareLink(null, folderId, options)` — share entire folder
  - Constraint: exactly one of `file_id` or `folder_id` must be set
  - **Folder share viewer UI** in `/s/[token]`:
    - Show folder name + listing of files (icon, name, size) and subfolders
    - Subfolder navigation: clicking subfolder reloads with `?path=subfolder` query param (same share token)
    - Individual file download button per file (no bulk ZIP for MVP)
    - Breadcrumb navigation within the shared folder context
    - Mobile-responsive layout

---

## Deliverables

| Output            | Location                                       |
| ----------------- | ---------------------------------------------- |
| Share service     | `src/lib/services/share-service.ts`            |
| OTP service       | `src/lib/services/otp-service.ts`              |
| Email service     | `src/lib/email/index.ts`                       |
| Share dialog      | `src/components/share/create-share-dialog.tsx` |
| Share viewer page | `src/app/s/[token]/page.tsx`                   |
| Share links list  | `src/components/share/share-links-list.tsx`    |

---

## Testing

### Automated (Vitest)

```bash
npx vitest run tests/sharing
```

| Test                                                   | Expected              |
| ------------------------------------------------------ | --------------------- |
| Create share link → access with valid token            | Returns file          |
| Access expired link                                    | Returns 410 (expired) |
| Access revoked link                                    | Returns 404           |
| Access with email allowlist, correct email + valid OTP | Succeeds              |
| OTP wrong code 3 times                                 | Locked out            |
| OTP expired (> 5 min)                                  | Returns 401           |
| Download count exceeds max                             | Returns 403           |
| Access log recorded on each access                     | DB row exists         |
| Token enumeration: random token → 404                  | No info leakage       |

### Manual Verification

1. Upload file → Share → create public link → open in incognito → verify file loads
2. Create link with 1h expiry → verify it works now
3. Create link with email allowlist → enter email → receive OTP → verify access
4. Create link → revoke it → verify incognito access returns 404
5. Create link with max 2 downloads → download twice → third attempt blocked
