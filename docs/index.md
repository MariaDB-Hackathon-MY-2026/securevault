---
layout: home

hero:
  name: SecureVault Docs
  text: Product depth, system design, and operating guidance in one place
  tagline: Review the product, understand the architecture, run it locally, and inspect the implemented API and test surface.
  image:
    src: /images/landing_page.webp
    alt: SecureVault landing page preview
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
---

## What lives here

- Use [Local Development](./getting-started/local-development.md) when you want to boot the project quickly.
- Use [Project Handbook](./architecture/project-handbook.md) when you need the product and engineering overview.
- Use [API Reference](./reference/api.md) when you need route-level contracts and limits.
- Use [Docker and Compose](./operations/docker-compose.md) for container workflows and env expectations.
- Use [Playwright Coverage](./testing/playwright.md) to understand the current end-to-end test surface.
- Use [UI Showcase](./product/ui-showcase.md) when you want a fast visual tour without running the app.

## Documentation principles

- Keep public docs grouped by user intent instead of by the order they were written.
- Prefer relative links between pages so the docs work both on GitHub and on the published site.
- Store static site assets under `docs/public/` so GitHub Pages builds do not depend on files outside the docs source tree.
- Deploy with GitHub Actions artifacts, which is GitHub's recommended path when you need a static site build step.
