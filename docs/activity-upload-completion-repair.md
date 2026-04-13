# Activity Upload Completion Repair

Run this after the activity-feed schema and application code are deployed to backfill any `ready` files that were written while the old upload-complete write path was still running.

## Repair SQL

```sql
UPDATE files
SET upload_completed_at = created_at,
    upload_completed_at_approximate = 1
WHERE status = 'ready'
  AND upload_completed_at IS NULL;
```

## Verification

```sql
SELECT COUNT(*) AS remaining_null_upload_completed_at
FROM files
WHERE status = 'ready'
  AND upload_completed_at IS NULL;
```

The repair is idempotent. A successful run leaves `remaining_null_upload_completed_at = 0` and does not overwrite rows that already have a real completion timestamp.
