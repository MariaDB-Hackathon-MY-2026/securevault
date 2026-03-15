ALTER TABLE `sessions` CHANGE COLUMN `expires_at` `refresh_expires_at` timestamp NOT NULL;
--> statement-breakpoint
ALTER TABLE `sessions` ADD `session_expires_at` timestamp NULL AFTER `ip_address`;
--> statement-breakpoint
UPDATE `sessions`
SET `session_expires_at` = LEAST(`refresh_expires_at`, DATE_ADD(`created_at`, INTERVAL 15 MINUTE));
--> statement-breakpoint
ALTER TABLE `sessions` MODIFY COLUMN `session_expires_at` timestamp NOT NULL;
