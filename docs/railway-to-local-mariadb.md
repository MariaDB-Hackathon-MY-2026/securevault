# Railway MariaDB to Local Compose MariaDB

This guide moves the SecureVault database from Railway MariaDB into the local MariaDB service defined in the repo root `compose.yaml`.

It is intended for local development only.

## What moves and what does not

- MariaDB schema and data move with the SQL dump.
- Cloudflare R2 objects do not move. Keep the same `R2_*` environment variables if you still want local uploads, downloads, and previews to point at the existing bucket.
- Encrypted keys stored in MariaDB remain usable only if the same `MASTER_ENCRYPTION_KEY` is present in local `.env.local`.

## Local Compose defaults

The local MariaDB service uses these defaults unless you override them in the shell before starting Compose:

```env
MARIADB_ROOT_PASSWORD=securevault_root
MARIADB_DATABASE=SecureVault
MARIADB_USER=securevault
MARIADB_PASSWORD=securevault
```

The app should then use:

```env
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3307
DATABASE_NAME=SecureVault
DATABASE_USER=securevault
DATABASE_PASSWORD=securevault
```

## 1. Create a backup from Railway

Run the dump from the repo root so the backup lands in `artifacts/`.

```powershell
docker run --rm `
  mariadb:11.8 `
  mariadb-dump `
  --single-transaction `
  --quick `
  --skip-lock-tables `
  --default-character-set=utf8mb4 `
  --ssl `
  --host="<railway-host>" `
  --port="<railway-port>" `
  --user="<railway-user>" `
  --password="<railway-password>" `
  --databases "<railway-database>" `
  > .\artifacts\railway-backup.sql
```

Recommended checks before moving on:

- Confirm the dump file exists and is not empty.
- Keep a copy of the original Railway connection settings somewhere safe before changing `.env.local`.

## 2. Start the local MariaDB service

From `secure-vault/`:

```powershell
npm run dev:db
```

From the repo root, you can also inspect the service:

```powershell
docker compose ps
```

Wait until the MariaDB container is healthy before importing.

## 3. Import the dump into local MariaDB

From the repo root:

```powershell
$containerId = docker compose ps -q mariadb
docker cp .\artifacts\railway-backup.sql "${containerId}:/tmp/railway-backup.sql"
docker compose exec mariadb sh -lc 'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE" </tmp/railway-backup.sql'
```

If you need a clean re-import, remove the MariaDB volume first:

```powershell
docker compose down -v
```

That clears all Compose volumes for this repo, including Redis. Then start MariaDB again and repeat the import.

## 4. Point the app at local MariaDB

Update `secure-vault/.env.local`:

```env
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3307
DATABASE_NAME=SecureVault
DATABASE_USER=securevault
DATABASE_PASSWORD=securevault
```

Keep your existing:

- `MASTER_ENCRYPTION_KEY`
- `R2_*`
- `RESEND_API_KEY`
- `OPENAI_API_KEY`
- `REDIS_URL`

## 5. Validate the import

Check that the main tables exist:

```powershell
docker compose exec mariadb mariadb -usecurevault -psecurevault SecureVault -e "SHOW TABLES;"
```

Check a few row counts that matter to your data set:

```powershell
docker compose exec mariadb mariadb -usecurevault -psecurevault SecureVault -e "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS files FROM files; SELECT COUNT(*) AS folders FROM folders;"
```

Then start the app from `secure-vault/`:

```powershell
npm run dev
```

Log in and verify a few common flows:

- dashboard loads
- files list renders
- file download still succeeds against the configured R2 bucket
- share links still resolve if their related app secrets remain unchanged

## 6. When to run Drizzle migrations

If you imported a full Railway dump, you usually do not need to run Drizzle immediately because the schema came with the dump.

Use Drizzle only when:

- you intentionally imported data into an older local schema
- you have new unapplied migrations in `secure-vault/drizzle/`
- you want to bootstrap an empty local database without importing production data

For an empty local database bootstrap, run from `secure-vault/` after local env vars point to `127.0.0.1:3307`:

```powershell
npx drizzle-kit push
```

## Notes specific to this repo

- The existing Drizzle migrations include `VECTOR(1536)` columns for embeddings, so the local image needs a MariaDB version that supports the `VECTOR` type.
- The local Compose service uses MariaDB `11.8` for that reason.
- The Compose file publishes MariaDB on host port `3307` by default to avoid conflicts with an existing local MySQL or MariaDB server on `3306`.
