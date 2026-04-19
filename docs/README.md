# SecureVault Docs

Product-specific documentation lives here. These files describe the repository and runtime behavior that are implemented in this codebase today.

External references, security standards, and UI guidance live in [`../resources/README.md`](../resources/README.md).

## Canonical docs

- [04-project-handbook.md](./04-project-handbook.md): the current product and engineering overview of how the app works
- [05-api-reference.md](./05-api-reference.md): the canonical HTTP API and server-action reference
- [06-docker-and-compose.md](./06-docker-and-compose.md): container layout, service responsibilities, and local Compose workflows
- [07-playwright-coverage.md](./07-playwright-coverage.md): Playwright execution model, covered cases, and current gaps

## Supplemental engineering notes

- [01-upload-queue-architecture.md](./01-upload-queue-architecture.md): deeper explanation of the upload queue internals
- [02-test-reflections.md](./02-test-reflections.md): locator and stability lessons from Playwright work
- [03-activity-rollout.md](./03-activity-rollout.md): rollout note for the activity-feed timestamp migration
- [activity-upload-completion-repair.md](./activity-upload-completion-repair.md): one-off SQL repair note for upload completion timestamps
- [railway-to-local-mariadb.md](./railway-to-local-mariadb.md): importing Railway MariaDB data into the local Compose database

## Notes

The numbered docs in this directory are the current active sequence and now start at `01`. Earlier duplicated overview documents were removed in a prior cleanup, and the `resources` directory no longer carries a second API reference.
