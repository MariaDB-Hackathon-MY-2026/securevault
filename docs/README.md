# SecureVault Docs

## Start here

- [09-project-handbook.md](./09-project-handbook.md): the current product and engineering overview of how the app works
- [10-api-reference.md](./10-api-reference.md): route-by-route API surface and server-action references
- [11-docker-and-compose.md](./11-docker-and-compose.md): container layout, service responsibilities, and local Compose workflows
- [12-playwright-coverage.md](./12-playwright-coverage.md): Playwright execution model, covered cases, and current gaps

## Supplemental engineering notes

- [06-upload-queue-architecture.md](./06-upload-queue-architecture.md): deeper explanation of the upload queue internals
- [07-test-reflections.md](./07-test-reflections.md): locator and stability lessons from Playwright work
- [08-activity-rollout.md](./08-activity-rollout.md): rollout note for the activity-feed timestamp migration
- [activity-upload-completion-repair.md](./activity-upload-completion-repair.md): one-off SQL repair note for upload completion timestamps
- [railway-to-local-mariadb.md](./railway-to-local-mariadb.md): importing Railway MariaDB data into the local Compose database

## Consolidated and removed

The older high-level docs below were removed because their content was already duplicated by the handbook, API reference, implementation plan, and task breakdown:

- `01-project-overview.md`
- `02-architecture.md`
- `03-technology-stack.md`
- `04-security-design.md`
- `05-github-issues-timeline.md`
