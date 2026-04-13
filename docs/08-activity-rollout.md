# Activity Feed Rollout Notes

Phase 13 adds `files.upload_completed_at` as the canonical upload-complete timestamp for the activity feed.

## Migration behavior

The schema migration:

- adds the nullable `upload_completed_at` column
- backfills existing `files.status = 'ready'` rows from `created_at`
- adds owner-scoped activity indexes for uploads, share creation, share revocation, and share access

Backfilled upload timestamps are only an approximation for legacy rows because the previous schema did not store the exact completion instant.

## Post-deploy repair step

Run this idempotent SQL statement after the new application write path has shipped:

```sql
UPDATE files
SET upload_completed_at = created_at
WHERE status = 'ready'
  AND upload_completed_at IS NULL;
```

This catches any `ready` rows created in the deployment window between the migration landing and the updated upload-complete code writing `upload_completed_at`.

## Verification

Run this query before and after the repair:

```sql
SELECT COUNT(*) AS missing_upload_completed_at
FROM files
WHERE status = 'ready'
  AND upload_completed_at IS NULL;
```

Success criteria:

- before repair, the count may be non-zero during rollout
- after repair, the count is `0`
- rerunning the repair leaves the count at `0`
