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
```

Optional:

```bash
DISABLE_REDIS=true
REDIS_URL=redis://127.0.0.1:6379
```

If `DISABLE_REDIS=true` in local development, the app uses a no-op Redis adapter even when `REDIS_URL` is present. That disables Redis-backed rate limiting and global upload slot enforcement locally, but keeps the rest of the app usable.

2. Start Redis:

```bash
npm run dev:redis
```

3. Start the app in a separate terminal:

```bash
npm run dev
```

4. Optional Redis stop command:

```bash
npm run dev:redis:stop
```

## Redis configuration

The app uses standard Redis via `REDIS_URL`.

Redis is used for:

- request rate limiting
- global upload slot coordination across tabs and devices

## Docker Redis

The repo root contains `compose.yaml` with a local Redis service. The package scripts use that file directly:

```bash
npm run dev
npm run dev:redis
npm run dev:redis:stop
```

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
