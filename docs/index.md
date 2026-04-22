---
layout: home

hero:
  name: SecureVault Docs
  text: Product depth, system design, and operating guidance in one place
  tagline: Review the product, understand the architecture, run it locally, and inspect the implemented API and test surface.
  actions:
    - theme: brand
      text: Start With Local Setup
      link: /getting-started/local-development
    - theme: alt
      text: Read the Handbook
      link: /architecture/project-handbook
    - theme: alt
      text: Browse the API
      link: /reference/api

features:
  - title: Clear documentation structure
    details: The site is organized by onboarding, architecture, operations, reference, quality, and product showcase instead of a flat numbered file list.
  - title: GitHub Pages ready
    details: The docs build as a static VitePress site and deploy through the official GitHub Pages Actions flow rather than a generated branch.
  - title: Repository grounded
    details: Every page is derived from the codebase and current repository behavior, including API routes, Docker workflows, and test coverage.
  - title: MariaDB-centered system design
    details: The app uses MariaDB for far more than auth tables, including upload state, sharing controls, activity history, lifecycle management, and vector-backed semantic retrieval.
---

## What lives here

- Use [Local Development](./getting-started/local-development.md) when you want to boot the project quickly.
- Use [Project Handbook](./architecture/project-handbook.md) when you need the product and engineering overview.
- Use [API Reference](./reference/api.md) when you need route-level contracts and limits.
- Use [Docker and Compose](./operations/docker-compose.md) for container workflows and env expectations.
- Use [Playwright Coverage](./testing/playwright.md) to understand the current end-to-end test surface.
- Use [Benchmark Workflows](./testing/benchmarks.md) when you need to run or interpret the semantic retrieval and pipeline benchmarks.
- Use [UI Showcase](./product/ui-showcase.md) when you want a fast visual tour without running the app.

## Documentation principles

- Keep public docs grouped by user intent instead of by the order they were written.
- Prefer relative links between pages so the docs work both on GitHub and on the published site.
- Store static site assets under `docs/public/` so GitHub Pages builds do not depend on files outside the docs source tree.
- Deploy with GitHub Actions artifacts, which is GitHub's recommended path when you need a static site build step.

## Why MariaDB matters in SecureVault

- MariaDB is the single durable system of record for auth, sessions, uploads, sharing, quotas, activity, and semantic indexing state.
- Transactional flows matter in this repo: password-reset OTP consumption, share governance, and upload completion all depend on consistent database behavior.
- The semantic retrieval path is still part of the MariaDB story because indexed chunks and vectors are stored in MariaDB and ranked there before the app formats results.
- That combination makes the project a stronger MariaDB hackathon submission than a typical app that only uses the database for basic CRUD.
