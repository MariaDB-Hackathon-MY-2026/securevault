---
title: Security In Plain English
description: Non-technical explanation of SecureVault's security posture and honest limits.
---

# Security In Plain English

SecureVault is designed around practical security boundaries for a server-managed storage application. The goal is to protect files at rest, enforce scoped access, make sharing explicit, and avoid pretending the browser can prevent every kind of copying.

## What SecureVault Protects Well

### Files are encrypted at rest

Uploaded file chunks are encrypted before they are stored in Cloudflare R2.

Why it matters:

- object storage does not hold plain uploaded chunks
- the app keeps encryption and decryption behind authorized server flows
- file data is separated from metadata and access rules

### Users only see their own workspace

Dashboard reads and writes are scoped to the signed-in user.

Why it matters:

- file listings, folder actions, downloads, previews, storage data, trash, and semantic search all depend on current-user checks
- direct route calls still need authorization, not just hidden UI buttons

### Sharing is explicit

Owners create share links intentionally.

Why it matters:

- a file or folder is private by default
- a share link has its own target, token, expiry, revocation state, and optional download cap
- owners can revoke or update link behavior

### Restricted sharing uses email plus OTP

Restricted links require the visitor to use an allowed email address and verify an OTP.

Why it matters:

- link possession alone is not enough for restricted shares
- OTPs are short-lived and attempt-limited
- allowed-email checks avoid turning every link into a public link

### Downloads and sensitive routes are rate-limited

Login, signup, password reset, share OTP, upload, and download flows have rate limits.

Why it matters:

- brute force and repeated abuse attempts are slowed down
- expensive paths have operational guardrails

### Shared PDF preview avoids exposing the original PDF inline

For shared PDF preview, SecureVault can render page images instead of serving the original PDF directly for inline viewing.

Why it matters:

- visitors can read the content without receiving the original PDF as the preview format
- rendered WebP pages can be cached server-side while browser responses stay `no-store`
- access checks still happen before preview pages are returned

## Honest Limits

### This is not end-to-end encryption

SecureVault uses application-managed encryption at rest.

That means:

- files are encrypted in storage
- the server can decrypt files for authorized preview, download, sharing, and indexing
- this is not a model where only the user's device holds the decryption key

This is the right honest description for the current architecture.

### A verified viewer can still capture what they see

SecureVault deters casual saving and inspection in shared previews, but it cannot prevent screenshots or external screen recording.

That means:

- right-click blocking is a deterrent
- protected preview rendering is a deterrent
- `no-store` headers reduce browser caching
- none of these can stop a person from photographing or capturing their screen

The product should describe this as controlled sharing and preview deterrence, not impossible copy prevention.

### Local development can intentionally relax some dependencies

Redis can be disabled locally for development convenience.

That means:

- the app can remain usable without Redis in local mode
- production-like rate limiting and global upload slot coordination need Redis configured

## Why The Security Architecture Is Production-Facing

SecureVault separates security concerns into layers:

- MariaDB stores durable identity, session, ownership, share, OTP, quota, and audit state.
- R2 stores encrypted object bytes.
- Redis handles rate limits, coordination, and hot preview cache paths.
- Server routes and actions enforce authorization before sensitive work.
- Browser UI adds usability and deterrence, but does not become the only security boundary.

That layered model is what makes the application credible as a production-oriented secure storage system.

