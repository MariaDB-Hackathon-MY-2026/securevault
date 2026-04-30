---
title: Demo Walkthrough
description: A reviewer-friendly path through the SecureVault product experience.
---

# Demo Walkthrough

This walkthrough is written for judges, reviewers, teammates, or portfolio visitors who want to understand SecureVault quickly without reading the full technical handbook first.

## 1. Start At The Landing Page

Open the public landing page and note the main product promise:

- secure file storage
- controlled sharing
- recoverable deletion
- optional semantic search

The landing page is meant to introduce the product before the reviewer enters the dashboard.

## 2. Create An Account Or Sign In

Use the signup or login flow to enter the workspace.

What to point out:

- the app uses real session cookies
- passwords are hashed
- dashboard routes are protected server-side
- password reset exists as an OTP flow

Production-facing angle:

- auth, recovery, and sessions are modeled as durable database-backed flows rather than static demo forms

## 3. Upload A File

Upload a PDF or supported image.

What to point out:

- the upload queue appears globally
- progress updates while chunks upload
- uploads can be paused, resumed, cancelled, retried, and removed
- successful uploads become usable even if semantic indexing is unavailable

Production-facing angle:

- upload sessions are resumable
- concurrency is coordinated through Redis
- encrypted chunks are stored in R2
- MariaDB remains the source of truth for upload state and metadata

## 4. Organize The Workspace

Create a folder, move a file into it, rename an item, switch views, and use filename search.

What to point out:

- the file explorer behaves like a real workspace
- bulk actions are supported
- breadcrumbs and folder navigation stay consistent
- invalid folder moves are prevented

Production-facing angle:

- folder hierarchy is modeled in MariaDB
- server actions enforce ownership and lifecycle rules
- optimistic UI updates still reconcile with server authority

## 5. Preview And Download

Preview a supported file and then download it.

What to point out:

- users can inspect files without leaving the dashboard
- downloads stream through app routes
- the browser never receives raw object storage keys

Production-facing angle:

- preview and download routes repeat ownership checks
- files are decrypted only after authorization
- download routes can be rate-limited and audited

## 6. Create A Public Share Link

Share a file or folder publicly and open the link as a visitor.

What to point out:

- shared links can expose a single file or a navigable folder subtree
- visitor access does not require a normal account
- owner-controlled link state remains editable

Production-facing angle:

- share links are token-scoped records with expiry, revocation, target type, and download-limit rules
- shared folder access validates requested files and folders against the allowed subtree

## 7. Create A Restricted Share Link

Create a restricted link with an allowed email address and request an OTP as the visitor.

What to point out:

- the visitor must prove control of an allowed email
- wrong or expired OTPs do not unlock access
- the visitor can sign out of the share session

Production-facing angle:

- allowed emails, OTP records, share sessions, and access logs are separate durable concepts
- OTP request and verification routes are rate-limited
- generic responses avoid leaking allowlist membership

## 8. Open A Shared PDF Preview

Use a shared PDF link and open the preview.

What to point out:

- the visitor sees rendered page images
- the original PDF is not served inline for preview
- browser-level save and inspect shortcuts are deterred
- the app is honest that screenshots cannot be prevented

Production-facing angle:

- shared PDF preview uses manifest and page-image routes
- authorization happens before cache lookup
- Redis caches hot page responses
- encrypted R2 derivatives avoid re-rendering every page forever
- browser responses stay `no-store`

## 9. Check Storage

Open the storage dashboard.

What to point out:

- quota usage is visible
- active storage, trash, categories, and largest files are surfaced

Production-facing angle:

- storage analytics come from server-side state
- the model can grow into billing tiers, team quotas, or admin reporting

## 10. Delete And Restore

Delete a file or folder, open Trash, restore it, then try permanent delete.

What to point out:

- deletion is recoverable first
- permanent deletion is explicit
- folder subtree behavior is handled

Production-facing angle:

- soft delete, restore, permanent purge, and retention cleanup are different lifecycle states
- permanent delete also handles storage cleanup and share-link cleanup

## 11. Review Activity

Open the activity page after uploading, sharing, revoking, or accessing shared content.

What to point out:

- the app records meaningful account events
- share access is visible to the owner
- activity remains readable after files are deleted

Production-facing angle:

- audit-style history is stored as durable product data, not just temporary toast notifications

## 12. Try Semantic Search

If semantic indexing is enabled, search for content meaning rather than exact filename.

What to point out:

- semantic search is optional
- indexing status is visible
- retry and re-index actions exist
- soft-deleted files disappear from search results

Production-facing angle:

- indexing is job-based and feature-gated
- vectors and chunk state live in MariaDB
- search remains scoped to the current user
- AI enhances the storage product without becoming a hard dependency

## Recommended Demo Order

For a short demo, use this sequence:

1. Landing page
2. Signup/login
3. Upload PDF
4. Folder organization
5. Public share
6. Restricted OTP share
7. Shared PDF preview
8. Storage dashboard
9. Trash restore
10. Activity timeline
11. Semantic search

That route shows the product value first, then naturally reveals the engineering depth behind it.

