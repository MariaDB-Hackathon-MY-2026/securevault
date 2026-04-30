---
title: Playwright Coverage
description: How the Playwright suite runs today and which user-facing cases it covers.
---

# Playwright Coverage

This document explains how the Playwright suite runs today and what user-facing cases it already covers.

## How the suite is wired

- Config file: <RepoLink path="secure-vault/playwright.config.ts" />
- Test directory: <RepoLink path="secure-vault/tests/e2e" kind="tree" />
- Browser matrix: Chromium only
- Retries: `2` on CI, `0` locally
- Reporter: `list`
- Base URL: `PLAYWRIGHT_BASE_URL` or `http://127.0.0.1:3000`

Important runtime behavior:

- Playwright does not boot the app for you; the app must already be running
- `ensureTestEnvLoaded()` loads Next env files before the suite starts
- E2E defaults semantic indexing to enabled with the fake provider when no Gemini key is present
- E2E defaults Redis to `redis://127.0.0.1:6379` unless `PLAYWRIGHT_USE_LOCAL_REDIS=0`

## Commands

From `secure-vault/`:

```powershell
npm run test:e2e
```

Opens Playwright UI mode against an already running app.

```powershell
npm run test:e2e:managed
```

Runs the suite headlessly against an already running app.

## Prerequisites

For meaningful E2E coverage you need:

- the app running at the configured base URL
- MariaDB available and initialized
- Redis available unless you are intentionally testing with Redis disabled
- valid `R2_*` credentials for real upload and download flows
- a local env file that lets the app create users, sessions, files, and shares

CI note:

- `.github/workflows/test.yml` currently runs lint plus Vitest only
- Playwright is intentionally left out of CI for now

## Coverage by area

| Area | Spec files | Covered cases |
| --- | --- | --- |
| Auth and account recovery | `password-reset.spec.ts`, `upload-user-bootstrap.spec.ts` | signup bootstrap, verified-on-signup behavior, forgot-password request privacy, session invalidation after reset, used or expired reset codes, locked reset codes |
| Upload flow | `upload-smoke.spec.ts` | mixed batch uploads, queue visibility, success states, oversize rejection, semantic indexing after upload, upload success even when indexing cannot start |
| Upload queue control | `upload-queue-controls.spec.ts`, `upload-global-queue.spec.ts` | saturation, waiting for slots, cancel while queued, pause, resume, remove, resume from status endpoint, resume after reload, skip completed chunks |
| File and folder management | `file-actions.spec.ts`, `file-browser-controls.spec.ts` | folder creation, file rename, file move, folder move, descendant-move prevention, deletes, bulk actions, grid and list modes, filename search, sorting, breadcrumb updates |
| File access | `file-access.spec.ts` | real multi-chunk downloads with checksum verification, unauthorized preview and download returning `404` |
| Sharing: owner flows | `share-owner-management.spec.ts`, `share-owner-validation.spec.ts`, `share-download-limits.spec.ts` | create, edit, and revoke links, download-cap validation, duplicate email normalization, switch restricted links back to public, owner UI reflecting usage limits |
| Sharing: visitor flows | `share-public-file.spec.ts`, `share-preview-variants.spec.ts`, `share-folder.spec.ts`, `share-restricted-file.spec.ts`, `share-restricted-edge-cases.spec.ts`, `share-session-invalidation.spec.ts` | direct public previews, shared PDF image preview, Redis cache hit/miss signaling for shared PDF pages, public downloads, folder navigation, restricted email allowlists, OTP unlock, wrong-code lockouts, expired OTPs, OTP replacement, visitor sign-out, revoked or expired sessions |
| Share auditing | `share-access-logging.spec.ts` | restricted unlock logs and successful download logging |
| Trash | `trash.spec.ts` | delete, restore, permanent delete, subtree trash behavior, mixed-item empty trash, restore conflict handling |
| Storage, filename search, and semantic search | `storage-search.spec.ts`, `semantic-indexing.spec.ts` | zero states, storage card updates, filename search thresholds, semantic result rendering, page-range context, multi-page window matches, re-index and retry actions, soft-deleted files disappearing from semantic results |
| Activity | `activity.spec.ts` | empty state, malformed cursors, upload completion, share create and revoke entries, share access entries, soft-deleted targets remaining readable in activity |

## Current suite shape

The suite mixes real end-to-end flows with a few controlled mocks where deterministic browser behavior matters more than backend setup cost.

Examples:

- real uploads and downloads are exercised in the upload and file-access specs
- queue-control specs mock some upload endpoints so pause, resume, and cancel behavior stays deterministic
- helper utilities create and clean up test users so specs can own their own setup

## Shared PDF Preview Cache Coverage

The shared PDF preview cache path is covered in the end-to-end suite through `share-preview-variants.spec.ts`.

What that spec validates today:

- a public shared PDF loads through `/api/share/:token/pdf-preview`
- the rendered page image loads through `/api/share/:token/pdf-preview/pages/1`
- the response `content-type` is `image/webp`, not `application/pdf`
- the first page-image response reports `X-Preview-Cache: miss`
- a second fresh browser context opening the same shared PDF reports `X-Preview-Cache: hit`

Why the header exists:

- Playwright can observe network traffic, but without a deterministic signal it cannot distinguish a Redis-served response from a service/R2-served response
- `X-Preview-Cache` gives the suite a stable assertion surface for the hot-cache path without exposing any sensitive cache internals to end users

Important limit of this coverage:

- the test proves the page route can warm Redis and then serve a later request from Redis
- access checks still happen before the cache lookup, but that authorization ordering is primarily enforced by route-level tests and the architecture itself rather than by a browser-only assertion

## What is not covered yet

- cross-browser coverage beyond Chromium
- visual regression testing
- dedicated mobile viewport coverage
- Playwright execution in CI
- container-specific smoke tests for the Compose `web` and `worker` services

## Related docs

- [Project Handbook](../architecture/project-handbook.md)
- [Shared Preview Protection](../security/shared-preview-protection.md)
- [API Reference](../reference/api.md)
