# SecureVault

SecureVault is a Next.js secure file-storage application focused on encrypted-at-rest uploads, scoped sharing, lifecycle controls, and optional semantic search. This repository is the project workspace; the running app lives in [`secure-vault/`](secure-vault/).

Implemented today:

- account signup, login, session cookies, and password-reset OTP flows
- encrypted chunked uploads to Cloudflare R2 with resume and queue controls
- file and folder management, trash, storage dashboards, and activity feeds
- public and restricted share links with OTP verification, download caps, and access logging
- optional semantic indexing and semantic search for eligible PDFs and images

Important current-state note: the real product entry point is the authenticated dashboard under `/files`, `/activity`, `/storage`, `/settings`, and `/trash`. The root `/` route in `secure-vault/src/app/page.tsx` is still the default Next.js starter page.

## Repository layout

| Path | Purpose |
| --- | --- |
| [`secure-vault/`](secure-vault/) | Next.js app, database schema, API routes, Dockerfile, and automated tests |
| [`docs/`](docs/) | Current handbook, API reference, Docker/Compose guide, Playwright coverage guide, and supplemental engineering notes |
| [`resources/`](resources/) | Curated development, API, and security references |
| [`tasks/`](tasks/) | Phase-by-phase implementation breakdown |
| [`implementation_plan.md`](implementation_plan.md) | Longer architecture and delivery blueprint |

## Local setup

1. Install dependencies:

   ```powershell
   cd secure-vault
   npm install
   ```

2. Create `secure-vault/.env.local` from [`secure-vault/.env.example`](secure-vault/.env.example).

3. Set the minimum local values:

   ```env
   DATABASE_HOST=127.0.0.1
   DATABASE_PORT=3307
   DATABASE_NAME=SecureVault
   DATABASE_USER=securevault
   DATABASE_PASSWORD=securevault
   MASTER_ENCRYPTION_KEY=<64-char hex key>
   R2_ACCOUNT_ID=<your-r2-account-id>
   R2_ACCESS_KEY_ID=<your-r2-access-key>
   R2_SECRET_ACCESS_KEY=<your-r2-secret>
   R2_BUCKET_NAME=<your-r2-bucket>
   NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
   REDIS_URL=redis://127.0.0.1:6379
   SEMANTIC_INDEXING_ENABLED=true
   SEMANTIC_INDEXING_EXECUTION_MODE=inline
   SEMANTIC_INDEXING_PROVIDER=google
   GEMINI_API_KEY=<your-gemini-api-key>
   GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
   ```

   Generate a local master key with:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Notes:

   - `R2_*` credentials are required for real upload, preview, and download flows.
   - Set `DISABLE_REDIS=true` if you want local development without Redis-backed rate limiting and upload-slot coordination.
   - The documented local default keeps semantic indexing enabled with `SEMANTIC_INDEXING_EXECUTION_MODE=inline`.
   - `SEMANTIC_INDEXING_PROVIDER=google` requires a valid `GEMINI_API_KEY`.

4. Start local infrastructure:

   ```powershell
   npm run dev:services
   ```

5. Bootstrap an empty local database once:

   ```powershell
   npx drizzle-kit migrate
   ```

   This applies the checked-in SQL migrations in `secure-vault/drizzle/` and records them in Drizzle's migration log table.

6. Start the app:

   ```powershell
   npm run dev
   ```

7. Open `http://127.0.0.1:3000/login`.

For a Railway dump import workflow, see [docs/railway-to-local-mariadb.md](docs/railway-to-local-mariadb.md).

## Docker and Compose

The repo-root [`compose.yaml`](compose.yaml) supports two modes:

- local dependency services only: MariaDB and Redis
- full container stack: `web` under the `app` profile, with `worker` as a separate opt-in `worker` profile

Use local services only:

```powershell
cd secure-vault
npm run dev:services
```

Use the full container stack:

1. Create `secure-vault/.env.local` with the app secrets needed by the image.
2. Start the stack:

   ```powershell
   docker compose --profile app up --build
   ```

3. Start the semantic worker only when you intentionally want queued execution:

   ```powershell
   docker compose --profile app --profile worker up --build
   ```

> [!WARNING]
> The built Docker image contains your local `secure-vault/.env.local`.
> Do not push or share built images from this repo unless you first remove or rotate the embedded secrets.
> Each user should build locally with their own env file instead of reusing someone else's image.
> The documented local path keeps semantic indexing enabled with `SEMANTIC_INDEXING_EXECUTION_MODE=inline`.
> The worker flow is less stable and only makes sense when `SEMANTIC_INDEXING_EXECUTION_MODE=queued`.

The container guide is in [docs/11-docker-and-compose.md](docs/11-docker-and-compose.md).

## Testing

- `npm run lint`
- `npm test`
- `npm run test:e2e` opens the Playwright UI against an already running app
- `npm run test:e2e:managed` runs the suite headlessly against an already running app

CI currently runs lint plus Vitest. Playwright remains a manual/managed suite for now.

The coverage and case matrix is in [docs/12-playwright-coverage.md](docs/12-playwright-coverage.md).

## Documentation

Start with [docs/README.md](docs/README.md), then use:

- [Project handbook](docs/09-project-handbook.md)
- [API reference](docs/10-api-reference.md)
- [Docker and Compose guide](docs/11-docker-and-compose.md)
- [Playwright coverage guide](docs/12-playwright-coverage.md)
- [Architecture blueprint](implementation_plan.md)

## Main implementation entry points

- [`secure-vault/package.json`](secure-vault/package.json)
- [`secure-vault/src/app/`](secure-vault/src/app/)
- [`secure-vault/src/lib/`](secure-vault/src/lib/)
- [`secure-vault/tests/`](secure-vault/tests/)
