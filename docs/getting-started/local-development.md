---
title: Local Development
description: Run SecureVault locally with the default host app plus Docker services workflow.
---

# Local Development

This is the fastest way to run SecureVault locally with the current repository layout.

## Repository layout

- Repository root: `securevault/`
- Main application: `secure-vault/`
- Public docs site source: `docs/`

## Quick start

1. Install app dependencies.

   ```powershell
   cd secure-vault
   npm install
   ```

2. Create `secure-vault/.env.local` from the checked-in <RepoLink path="secure-vault/.env.example" /> file.

3. Set the minimum required values.

   ```ini
   DATABASE_HOST=127.0.0.1
   DATABASE_PORT=3307
   DATABASE_NAME=SecureVault
   DATABASE_USER=securevault
   DATABASE_PASSWORD=securevault
   MASTER_ENCRYPTION_KEY=<64-char hex key>
   R2_ACCOUNT_ID=<r2-account-id>
   R2_ACCESS_KEY_ID=<r2-access-key>
   R2_SECRET_ACCESS_KEY=<r2-secret>
   R2_BUCKET_NAME=<r2-bucket>
   NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
   REDIS_URL=redis://127.0.0.1:6379
   SEMANTIC_INDEXING_ENABLED=true
   SEMANTIC_INDEXING_EXECUTION_MODE=inline
   SEMANTIC_INDEXING_PROVIDER=google
   GEMINI_API_KEY=<gemini-api-key>
   GEMINI_EMBEDDING_MODEL=gemini-embedding-2-preview
   ```

   Leave `DATABASE_SSL_MODE` empty for the default local Compose MariaDB flow. When you connect to a managed MariaDB instance that requires TLS, set `DATABASE_SSL_MODE=verify-full` and provide `DATABASE_SSL_CA` if your provider uses a custom CA bundle.

4. Generate a master key if needed.

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Start MariaDB and Redis.

   ```powershell
   npm run dev:services
   ```

6. Apply the checked-in migrations.

   ```powershell
   npx drizzle-kit migrate
   ```

7. Start the app.

   ```powershell
   npm run dev
   ```

8. Open [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login).

## Helpful local notes

- Real upload, preview, and download flows need valid `R2_*` credentials.
- For local runs without Redis-backed coordination, set `DISABLE_REDIS=true`.
- The documented local default keeps semantic indexing enabled with `SEMANTIC_INDEXING_EXECUTION_MODE=inline`.
- For local semantic indexing without an external Gemini key, use `SEMANTIC_INDEXING_PROVIDER=fake`.
- If `RESEND_API_KEY` is unset, OTP and email flows log locally instead of sending real email.
- Signup is intentionally auto-verified right now for hackathon velocity; a fuller production rollout would gate activation behind a Resend-backed email verification flow or equivalent.

## Docs workflow

The documentation site has its own root-level package setup.

```powershell
npm install
npm run docs:dev
```

Use `npm run docs:build` before merging documentation changes to confirm the GitHub Pages build output still succeeds.
