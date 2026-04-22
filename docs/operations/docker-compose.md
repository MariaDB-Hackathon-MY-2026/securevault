---
title: Docker and Compose
description: Container responsibilities, env expectations, and supported local Docker workflows.
---

# Docker and Compose

This guide covers the container artifacts that already exist in the repo and how they map to local development.

## Files involved

- <RepoLink path="secure-vault/Dockerfile" />: production-style Next.js image build
- <RepoLink path="compose.yaml" />: local MariaDB and Redis services plus optional `web` and `worker` containers
- `.dockerignore`: excludes local dependencies, build output, and local env files from the image build context

## Container responsibilities

| Service | Purpose | Notes |
| --- | --- | --- |
| `web` | Runs the built Next.js app on port `3000` | Enabled through the `app` profile |
| `worker` | Runs `npm run worker:embeddings` | Only useful when semantic indexing is enabled and `SEMANTIC_INDEXING_EXECUTION_MODE=queued` |
| `mariadb` | Local MariaDB 12 database | Published on host port `3307` by default |
| `redis` | Local Redis 8 instance | Published on host port `6379` |

## Two supported workflows

### 1. Host-run app, Compose-run services

This is the main local development path today.

From `secure-vault/`:

```powershell
npm run dev:services
npm run dev
```

Use this when you want the normal Next.js development server and the package scripts already wired into the app folder.

### 2. Full container stack

The repo also defines containerized `web` and `worker` services:

```powershell
docker compose --profile app up --build
```

This path runs the production build inside Docker instead of `next dev`.

## Environment model

There are two different env entry points:

- `secure-vault/.env.local`: used by the app when you run it directly with `npm run dev`
- `secure-vault/.env.local`: also copied into the Docker image, so the containerized app uses the same app-level env file at build time and runtime

For both host mode and the full container stack, create `secure-vault/.env.local` with at least:

```ini
DATABASE_NAME=SecureVault
DATABASE_USER=securevault
DATABASE_PASSWORD=securevault
MASTER_ENCRYPTION_KEY=<64-char hex key>
R2_ACCOUNT_ID=<your-r2-account-id>
R2_ACCESS_KEY_ID=<your-r2-access-key>
R2_SECRET_ACCESS_KEY=<your-r2-secret>
R2_BUCKET_NAME=<your-r2-bucket>
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
REDIS_URL=redis://redis:6379
SEMANTIC_INDEXING_ENABLED=true
SEMANTIC_INDEXING_EXECUTION_MODE=inline
SEMANTIC_INDEXING_PROVIDER=google
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
```

If you connect the app to a managed MariaDB instance outside the default local container, you can enable verified TLS with:

```ini
DATABASE_SSL_MODE=verify-full
DATABASE_SSL_CA=<optional-pem-ca-bundle>
```

Leave `DATABASE_SSL_MODE` empty for the default local Compose MariaDB service unless you explicitly provision TLS for it.

Important behavior from `compose.yaml`:

- the app containers override `DATABASE_HOST` to `mariadb`
- the app containers override `DATABASE_PORT` to `3306`
- the app containers default `REDIS_URL` to `redis://redis:6379`
- MariaDB service credentials default to `SecureVault` / `securevault` / `securevault` unless you override them

That means host-mode app envs and container-mode app envs share the same app secrets, while Compose still supplies the container-network overrides.

## Useful commands

Start only MariaDB and Redis:

```powershell
docker compose up -d mariadb redis
```

Start the full stack:

```powershell
docker compose --profile app up --build
```

Stop the full stack:

```powershell
docker compose --profile app down
```

View service status:

```powershell
docker compose ps
```

Follow logs:

```powershell
docker compose logs -f web worker mariadb redis
```

Remove containers and named volumes:

```powershell
docker compose down -v
```

## Persistence

Compose keeps state in named volumes:

- `securevault-mariadb-data`
- `securevault-redis-data`

Those survive normal container restarts. `docker compose down -v` removes them.

## What Docker does not replace

The Docker setup does not change the core app dependencies:

- uploads, previews, and downloads still require valid `R2_*` credentials
- restricted sharing still needs the normal app secrets and email configuration
- semantic indexing still needs its provider settings when enabled
- the documented default keeps semantic indexing enabled with `SEMANTIC_INDEXING_EXECUTION_MODE=inline`
- the worker path is only for `SEMANTIC_INDEXING_EXECUTION_MODE=queued` and is currently less stable than inline execution

## Recommended use

- use host-run app plus Compose services for active feature work
- use the full container stack when you want a production-style local smoke run or need the embeddings worker in a container
