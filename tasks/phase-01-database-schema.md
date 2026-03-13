# Phase 1 - Database Schema & ORM

> **Objective:** Define the full MariaDB schema using Drizzle ORM, run migrations, and set up the DB connection singleton.

**Depends on:** Phase 0  
**Blueprint ref:** Sections 8 (Schema), 11 (Indexes, Performance), 18 (upload_sessions), 19 (file_versions, deleted_at)

---

## Tasks

- [ ] **1.1 - Create DB connection singleton**
  - File: `src/lib/db/index.ts`
  - Use `mysql2/promise` pool with `connectionLimit: 10` and `timezone: 'Z'` (enforce UTC)
  - Use `globalThis` caching pattern for dev hot-reload (Section 11)
  - Export `db` instance
  - Note: current implementation uses an explicit singleton connection wrapper instead of `globalThis` caching
  - Note: current implementation uses MariadbConnection.getConnection() as the access pattern instead of exporting a top-level db constant
  - Note: Railway connectivity currently also relies on DATABASE_PORT and SSL in addition to host/user/password/database

- [ ] **1.2 - Define `users` table schema**
  - File: `src/lib/db/schema/users.ts`
  - Columns: `id` (varchar PK, nanoid), `email` (unique), `name`, `password_hash`, `encrypted_uek` (blob), `storage_used` (bigint default 0), `storage_quota` (bigint default 1GB), `email_verified` (boolean default false), `created_at`, `updated_at`

- [ ] **1.3 - Define `sessions` table schema**
  - File: `src/lib/db/schema/sessions.ts`
  - Columns: `id`, `user_id` FK, `session_token_hash`, `refresh_token_hash`, `device_name`, `ip_address`, `expires_at`, `created_at`

- [ ] **1.4 - Define `folders` table schema**
  - File: `src/lib/db/schema/folders.ts`
  - Columns: `id`, `user_id` FK, `parent_id` FK (self-ref, nullable), `name`, `deleted_at` (timestamp nullable), `created_at`

- [ ] **1.5 - Define `files` table schema**
  - File: `src/lib/db/schema/files.ts`
  - Columns: `id`, `user_id` FK, `folder_id` FK (nullable), `name`, `mime_type`, `size` (bigint), `total_chunks` (int), `encrypted_fek` (blob), `status` (enum: uploading/ready/failed), `has_thumbnail` (boolean), `thumbnail_r2_key` (varchar), `deleted_at` (timestamp nullable), `created_at`, `updated_at`

- [ ] **1.6 - Define `file_chunks` table schema**
  - File: `src/lib/db/schema/file-chunks.ts`
  - Columns: `id`, `file_id` FK, `chunk_index` (int), `r2_key` (varchar), `iv` (blob), `auth_tag` (blob)

- [ ] **1.7 - Define sharing tables schema**
  - File: `src/lib/db/schema/sharing.ts`
  - Tables: `share_links`, `share_link_emails`, `share_link_otps`, `share_link_access_logs`
  - `share_links`: `id`, `file_id` (nullable), `folder_id` (nullable), `created_by` FK, `token` (unique), `expires_at`, `max_downloads`, `download_count`, `is_public`, `revoked_at`, `created_at`

- [ ] **1.8 - Define `upload_sessions` table schema**
  - File: `src/lib/db/schema/upload-sessions.ts`
  - Columns per Section 18: `id`, `user_id`, `file_id`, `file_name` (varchar 255), `file_size` (bigint), `total_chunks`, `completed_chunks`, `status` (enum), `expires_at`, `created_at`

- [ ] **1.9 - Define `file_versions` table schema** _(stretch goal - not in MVP)_
  - File: `src/lib/db/schema/file-versions.ts`
  - Columns per Section 19: `id`, `file_id`, `version_number`, `size`, `total_chunks`, `encrypted_fek`, `created_at`
  - Unique constraint on `(file_id, version_number)`
  - **Skip for MVP** - implement only if Phase 11 (File Versioning) is pursued
  - Note: current repo already includes `file_versions` in schema and migration output

- [ ] **1.10 - Define `password_reset_tokens` table schema**
  - File: `src/lib/db/schema/auth-tokens.ts`
  - Columns: `id`, `user_id` FK, `token_hash` (varchar), `expires_at`, `used_at` (nullable), `created_at`

- [ ] **1.11 - Define `email_verification_tokens` table schema**
  - Same file: `src/lib/db/schema/auth-tokens.ts`
  - Columns: `id`, `user_id` FK, `token_hash` (varchar), `expires_at`, `used_at` (nullable), `created_at`

- [ ] **1.12 - Create barrel export and relations**
  - File: `src/lib/db/schema/index.ts`
  - Export all tables (including auth-tokens)
  - Define Drizzle relations between tables

- [ ] **1.13 - Run initial migration**
  - `npx drizzle-kit generate` -> inspect SQL output
  - `npx drizzle-kit push` -> apply to Railway MariaDB
  - Verify all tables created (11+ tables - excluding `file_versions` for MVP)

- [ ] **1.14 - Create database indexes**
  - Apply indexes from Section 11:
    - `idx_files_user_id`, `idx_files_folder_id`, `idx_files_user_folder`
    - `idx_sessions_user_id`, `idx_share_links_token`, `idx_share_links_file_id`
    - `idx_file_chunks_file_id`, `idx_access_logs_link_id`
    - `idx_upload_sessions_user_file` on `(user_id, file_name, file_size, status)` for dedup

- [ ] **1.15 - Define PDF embedding tables**
  - Files: `src/lib/db/schema/pdf-embedding-jobs.ts`, `src/lib/db/schema/pdf-embedding-chunks.ts`
  - `pdf_embedding_jobs`: `id`, `file_id` FK, `status` (enum: queued/processing/ready/skipped/failed), `mime_type`, `file_size`, `embedding_model`, `embedding_dimensions`, `ocr_provider`, `error_code`, `error_message`, `triggered_by` FK, `started_at`, `completed_at`, `created_at`, `updated_at`
  - `pdf_embedding_chunks`: `id`, `job_id` FK, `file_id` FK, `chunk_index`, `page_from`, `page_to`, `char_count`, `encrypted_text` (blob), `text_iv` (blob), `text_auth_tag` (blob), `embedding` (`VECTOR(1536)`)
  - Keep extracted text encrypted at rest; only the vector column remains searchable plaintext

- [ ] **1.16 - Create PDF semantic search indexes**
  - Add relational indexes: `idx_pdf_embedding_jobs_file_id`, `idx_pdf_embedding_chunks_job_id`, `idx_pdf_embedding_chunks_file_id`
  - Add MariaDB vector index on `pdf_embedding_chunks.embedding` with cosine distance
  - Document the index as part of the schema migration review checklist

---

## Deliverables

| Output                   | Location                                  |
| ------------------------ | ----------------------------------------- |
| All Drizzle schema files | `src/lib/db/schema/*.ts`                  |
| DB connection singleton  | `src/lib/db/index.ts`                     |
| Migration applied        | All tables exist in Railway MariaDB       |
| Indexes created          | Verified via `SHOW INDEX FROM table_name` |
| PDF embedding tables     | `pdf_embedding_jobs`, `pdf_embedding_chunks` exist |

---

## Testing

### Automated

```bash
# Drizzle generates migration without errors
npx drizzle-kit generate

# Push schema to DB
npx drizzle-kit push

# TypeScript compiles clean (schema types valid)
npx tsc --noEmit
```

### Manual Verification

1. Connect to Railway MariaDB with a client (e.g., TablePlus, DBeaver)
2. Run `SHOW TABLES;` - verify all 10+ tables exist
3. Run `DESCRIBE users;` - verify columns match schema
4. Run `SHOW INDEX FROM files;` - verify indexes exist
5. Run `SHOW INDEX FROM pdf_embedding_chunks;` - verify the cosine vector index exists
6. Insert a test row into `users`, then query it back - verify read/write works


