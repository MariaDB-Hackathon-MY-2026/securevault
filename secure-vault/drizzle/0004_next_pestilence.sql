ALTER TABLE `share_links` MODIFY COLUMN `expires_at` timestamp;--> statement-breakpoint
ALTER TABLE `share_link_access_logs` ADD `email` varchar(255);--> statement-breakpoint
ALTER TABLE `share_link_otps` ADD `email` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `share_link_otps` ADD `attempt_count` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_share_links_folder_id` ON `share_links` (`folder_id`);