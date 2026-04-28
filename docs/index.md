---
layout: home

hero:
  name: SecureVault Docs
  text: Product depth, system design, and operating guidance in one place
  tagline: Start the app, understand the architecture, review shared-preview security, and inspect the implemented API and test surface.
  actions:
    - theme: brand
      text: Start With Local Setup
      link: /getting-started/local-development
    - theme: alt
      text: Read the Handbook
      link: /architecture/project-handbook
    - theme: alt
      text: Shared Preview Security
      link: /security/shared-preview-protection

features:
  - title: MariaDB-centered system design
    details: The app uses MariaDB for far more than auth tables, including upload state, sharing controls, activity history, lifecycle management, and vector-backed semantic retrieval.
  - title: Shared-preview security model
    details: The docs now explain SSR access gates, email allowlists, OTP sessions, protected preview rendering, no-store headers, and honest browser-copying limits.
  - title: Repository grounded
    details: Every page is derived from current repository behavior, including API routes, Docker workflows, security controls, and test coverage.
  - title: GitHub Pages ready
    details: The docs build as a static VitePress site and deploy through the official GitHub Pages Actions flow rather than a generated branch.
---

## What lives here

Read the docs in this order if you are new to the project:

1. [Local Development](./getting-started/local-development.md) gets the app and services running.
2. [Project Handbook](./architecture/project-handbook.md) explains the product, architecture, data model, and key workflows.
3. [Shared Preview Protection](./security/shared-preview-protection.md) documents the layered security and deterrence model for shared file previews.
4. [API Reference](./reference/api.md) lists route-level contracts, access rules, limits, and response headers.
5. [Docker and Compose](./operations/docker-compose.md) covers container workflows and environment expectations.
6. [Playwright Coverage](./testing/playwright.md) describes the end-to-end test surface.
7. [Benchmark Workflows](./testing/benchmarks.md) explains semantic retrieval and pipeline benchmarks.
8. [UI Showcase](./product/ui-showcase.md) gives a fast visual tour without running the app.

## Documentation principles

- Keep public docs grouped by user intent instead of by the order they were written.
- Put security notes near the flows they protect, then link to dedicated deep dives for details.
- Prefer relative links between pages so the docs work both on GitHub and on the published site.
- Store static site assets under `docs/public/` so GitHub Pages builds do not depend on files outside the docs source tree.
- Deploy with GitHub Actions artifacts, which is GitHub's recommended path when you need a static site build step.

## Why MariaDB matters in SecureVault

- MariaDB is the single durable system of record for auth, sessions, uploads, sharing, quotas, activity, and semantic indexing state.
- Transactional flows matter in this repo: password-reset OTP consumption, share governance, and upload completion all depend on consistent database behavior.
- The semantic retrieval path is still part of the MariaDB story because indexed chunks and vectors are stored in MariaDB and ranked there before the app formats results.
- That combination makes the project a stronger MariaDB hackathon submission than a typical app that only uses the database for basic CRUD.
