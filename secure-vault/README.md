# SecureVault

## Local development

1. Copy `.env.example` to `.env.local` and set at least:

```bash
DATABASE_HOST=...
DATABASE_PORT=...
DATABASE_NAME=...
DATABASE_USER=...
DATABASE_PASSWORD=...
MASTER_ENCRYPTION_KEY=...
S3_API=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
SEMANTIC_INDEXING_ENABLED=true
SEMANTIC_INDEXING_EXECUTION_MODE=inline
SEMANTIC_INDEXING_PROVIDER=google
GEMINI_API_KEY=...
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
```

Optional:

```bash
DISABLE_REDIS=true
REDIS_URL=redis://127.0.0.1:6379
```

For local database runs under Docker Compose, use these values:

```bash
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3307
DATABASE_NAME=SecureVault
DATABASE_USER=securevault
DATABASE_PASSWORD=securevault
```

When `DISABLE_REDIS=true` in local development, the app uses a no-op Redis adapter even when `REDIS_URL` is present. That disables Redis-backed rate limiting and global upload slot enforcement locally, but keeps the rest of the app usable.

The documented local default keeps semantic indexing enabled with `SEMANTIC_INDEXING_EXECUTION_MODE=inline`. Because the provider guidance matches the current app setup, set `SEMANTIC_INDEXING_PROVIDER=google` with a valid `GEMINI_API_KEY`.

2. Start MariaDB:

```bash
npm run dev:db
```

3. Start Redis:

```bash
npm run dev:redis
```

4. Start the app in a separate terminal:

```bash
npm run dev
```

For an empty local database, run this once before `npm run dev`:

```bash
npx drizzle-kit migrate
```

That applies the checked-in SQL migrations from `drizzle/` and creates Drizzle's migration log table for future runs.

5. Optional stop commands:

```bash
npm run dev:db:stop
npm run dev:redis:stop
```

To start both local services together:

```bash
npm run dev:services
```

To stop both local services:

```bash
npm run dev:services:stop
```

## Railway migration

For a full Railway MariaDB to local Compose MariaDB migration workflow, including dump/import commands and validation steps, see [`../docs/railway-to-local-mariadb.md`](../docs/railway-to-local-mariadb.md).

## Redis configuration

The app uses standard Redis via `REDIS_URL`.

Redis is used for:

- request rate limiting
- global upload slot coordination across tabs and devices

## Docker Redis

The repo root contains `compose.yaml` with local MariaDB and Redis services. The package scripts use that file directly:

```bash
npm run dev
npm run dev:db
npm run dev:redis
npm run dev:services
npm run dev:services:stop
npm run dev:redis:stop
```

## Docker builds

`secure-vault/Dockerfile` now copies any available `secure-vault/.env*` files into the image, including `.env.local`.

This means:

- the same env files are available to both `next build` and `next start`
- the image must be rebuilt after those env files change
- Compose still overrides container-only networking values like `DATABASE_HOST`, `DATABASE_PORT`, and `REDIS_URL`

> [!WARNING]
> Built images contain the copied env files, so do not push or share those images.
> Images should be built locally with an environment file that belongs to the current operator.
> The documented local path keeps semantic indexing enabled with `SEMANTIC_INDEXING_EXECUTION_MODE=inline`.
> The separate worker is only relevant when `SEMANTIC_INDEXING_EXECUTION_MODE=queued`.
> Queued worker execution is currently less stable than inline execution.

## E2E

Start Redis and the app first:

```bash
npm run dev:redis
npm run dev
```

Then run Playwright in another terminal:

```bash
npm run test:e2e
```
