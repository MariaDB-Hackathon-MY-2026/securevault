ALTER TABLE `password_reset_tokens` ADD `attempt_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_password_reset_tokens_active_lookup` ON `password_reset_tokens` (`user_id`,`used_at`,`expires_at`,`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `email_verified` boolean DEFAULT true NOT NULL;
