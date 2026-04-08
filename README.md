# SecureVault

SecureVault is a work-in-progress encrypted file storage platform being built for MariaDB Hackathon MY 2026. This repository is the project workspace: the product and architecture documents live at the root, while the active Next.js application lives in [`secure-vault/`](secure-vault/).

The project is centered on secure file handling with strong encryption, scoped access control, and a delivery plan that grows from core storage features into sharing, search, and AI-assisted workflows.

## What this repository contains

| Path | Purpose |
| --- | --- |
| [`secure-vault/`](secure-vault/) | Next.js app, source code, database schema, API routes, and tests |
| [`docs/`](docs/) | Project overview, architecture, stack, security design, and planning docs |
| [`resources/`](resources/) | Curated references for development, APIs, and security standards |
| [`tasks/`](tasks/) | Phase-by-phase implementation breakdown |
| [`implementation_plan.md`](implementation_plan.md) | Full architecture blueprint and delivery plan |

## Current state

The codebase already includes the main foundations for the app:

- authentication pages, session handling, and route protection
- crypto utilities and tests for file/key workflows
- Drizzle schema and migrations for users, sessions, files, folders, sharing, embeddings, and uploads
- dashboard sections for files, activity, settings, and trash
- upload session initialization and storage-related scaffolding

Some features described in the planning documents are still in progress or tracked as future phases, so use the docs for project intent and the application code for current implementation status.

## Quick start

1. Change into the app folder: `cd secure-vault`
2. Install dependencies: `npm install`
3. Set local environment variables using [`secure-vault/.env.example`](secure-vault/.env.example) as the template
4. Optional local services:
   - MariaDB: `cd secure-vault && npm run dev:db`
   - Redis: `cd secure-vault && npm run dev:redis`
   - Both: `cd secure-vault && npm run dev:services`
5. Start the development server: `npm run dev`

Useful scripts:

- `npm run dev`
- `npm run dev:db`
- `npm run lint`
- `npm run test`

For a Railway MariaDB to local Compose MariaDB workflow, see [docs/railway-to-local-mariadb.md](docs/railway-to-local-mariadb.md).

## Project documentation

### Core docs

- [Architecture blueprint](implementation_plan.md)
- [Project overview](docs/01-project-overview.md)
- [Architecture](docs/02-architecture.md)
- [Technology stack](docs/03-technology-stack.md)
- [Security design](docs/04-security-design.md)
- [GitHub issues timeline](docs/05-github-issues-timeline.md)

### Reference resources

- [Development resources](resources/development-resources.md)
- [API references](resources/api-references.md)
- [Security standards and guides](resources/security-standards.md)

### Delivery tracking

- [Task breakdown](tasks/README.md)
- [All phase documents](tasks/)

## Main app entry points

If you want to jump straight into the implementation, start here:

- [`secure-vault/package.json`](secure-vault/package.json)
- [`secure-vault/src/app/`](secure-vault/src/app/)
- [`secure-vault/src/lib/`](secure-vault/src/lib/)
- [`secure-vault/tests/`](secure-vault/tests/)
