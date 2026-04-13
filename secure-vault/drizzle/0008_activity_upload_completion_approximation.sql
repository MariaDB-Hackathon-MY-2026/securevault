ALTER TABLE `files`
ADD `upload_completed_at_approximate` boolean NOT NULL DEFAULT false;

UPDATE `files`
SET `upload_completed_at_approximate` = 1
WHERE `status` = 'ready'
  AND `upload_completed_at` IS NOT NULL
  AND `upload_completed_at` = `created_at`;
