ALTER TABLE `files`
ADD `upload_completed_at` timestamp NULL;

UPDATE `files`
SET `upload_completed_at` = `created_at`
WHERE `status` = 'ready'
  AND `upload_completed_at` IS NULL;

CREATE INDEX `idx_files_user_upload_completed_id`
  ON `files` (`user_id`, `upload_completed_at`, `id`);

CREATE INDEX `idx_share_links_owner_created_id`
  ON `share_links` (`created_by`, `created_at`, `id`);

CREATE INDEX `idx_share_links_owner_revoked_id`
  ON `share_links` (`created_by`, `revoked_at`, `id`);

CREATE INDEX `idx_share_links_owner_target_ids`
  ON `share_links` (`created_by`, `id`, `file_id`, `folder_id`);

CREATE INDEX `idx_access_logs_link_accessed_id`
  ON `share_link_access_logs` (`link_id`, `accessed_at`, `id`);
