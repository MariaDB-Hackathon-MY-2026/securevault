CREATE TABLE `email_verification_tokens` (
	`id` varchar(21) NOT NULL,
	`user_id` varchar(21) NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` varchar(21) NOT NULL,
	`user_id` varchar(21) NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_chunks` (
	`id` varchar(21) NOT NULL,
	`file_id` varchar(21) NOT NULL,
	`chunk_index` int NOT NULL,
	`r2_key` varchar(512) NOT NULL,
	`iv` blob NOT NULL,
	`auth_tag` blob NOT NULL,
	CONSTRAINT `file_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_versions` (
	`id` varchar(21) NOT NULL,
	`file_id` varchar(21) NOT NULL,
	`version_number` int NOT NULL,
	`size` bigint NOT NULL,
	`total_chunks` int NOT NULL,
	`encrypted_fek` blob NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_file_versions_file_version` UNIQUE(`file_id`,`version_number`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` varchar(21) NOT NULL,
	`user_id` varchar(21) NOT NULL,
	`folder_id` varchar(21),
	`name` varchar(255) NOT NULL,
	`mime_type` varchar(255) NOT NULL,
	`size` bigint NOT NULL,
	`total_chunks` int NOT NULL,
	`encrypted_fek` blob NOT NULL,
	`status` enum('uploading','ready','failed') NOT NULL DEFAULT 'uploading',
	`has_thumbnail` boolean NOT NULL DEFAULT false,
	`thumbnail_r2_key` varchar(255),
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` varchar(21) NOT NULL,
	`user_id` varchar(21) NOT NULL,
	`parent_id` varchar(21),
	`name` varchar(255) NOT NULL,
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdf_embedding_chunks` (
	`id` varchar(21) NOT NULL,
	`job_id` varchar(21) NOT NULL,
	`file_id` varchar(21) NOT NULL,
	`chunk_index` int NOT NULL,
	`page_from` int NOT NULL,
	`page_to` int NOT NULL,
	`char_count` int NOT NULL,
	`encrypted_text` longblob NOT NULL,
	`text_iv` blob NOT NULL,
	`text_auth_tag` blob NOT NULL,
	`embedding` vector(1536) NOT NULL,
	CONSTRAINT `pdf_embedding_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pdf_embedding_jobs` (
	`id` varchar(21) NOT NULL,
	`file_id` varchar(21) NOT NULL,
	`status` enum('queued','processing','ready','skipped','failed') NOT NULL DEFAULT 'queued',
	`mime_type` varchar(255) NOT NULL,
	`file_size` bigint NOT NULL,
	`embedding_model` varchar(100) NOT NULL,
	`embedding_dimensions` int NOT NULL DEFAULT 1536,
	`ocr_provider` varchar(100),
	`error_code` varchar(100),
	`error_message` varchar(1024),
	`triggered_by` varchar(21),
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdf_embedding_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `share_link_access_logs` (
	`id` varchar(21) NOT NULL,
	`link_id` varchar(21) NOT NULL,
	`ip_address` varchar(50) NOT NULL,
	`user_agent` varchar(255),
	`accessed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `share_link_access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `share_link_emails` (
	`id` varchar(21) NOT NULL,
	`link_id` varchar(21) NOT NULL,
	`email` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `share_link_emails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `share_link_otps` (
	`id` varchar(21) NOT NULL,
	`link_id` varchar(21) NOT NULL,
	`otp_hash` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `share_link_otps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` varchar(21) NOT NULL,
	`file_id` varchar(21),
	`folder_id` varchar(21),
	`created_by` varchar(21) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`max_downloads` int,
	`download_count` int NOT NULL DEFAULT 0,
	`is_public` boolean NOT NULL DEFAULT false,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `share_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_share_links_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(21) NOT NULL,
	`user_id` varchar(21) NOT NULL,
	`session_token_hash` varchar(255) NOT NULL,
	`refresh_token_hash` varchar(255) NOT NULL,
	`device_name` varchar(50) NOT NULL,
	`ip_address` varchar(50) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` varchar(21) NOT NULL,
	`user_id` varchar(21) NOT NULL,
	`file_id` varchar(21),
	`file_name` varchar(255) NOT NULL,
	`file_size` bigint NOT NULL,
	`total_chunks` int NOT NULL,
	`completed_chunks` int NOT NULL DEFAULT 0,
	`status` enum('uploading','completed','failed','expired') NOT NULL DEFAULT 'uploading',
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `upload_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(21) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`encrypted_uek` blob NOT NULL,
	`storage_used` bigint NOT NULL DEFAULT 0,
	`storage_quota` bigint NOT NULL DEFAULT 1073741824,
	`email_verified` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `email_verification_tokens` ADD CONSTRAINT `email_verification_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `file_chunks` ADD CONSTRAINT `file_chunks_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `file_versions` ADD CONSTRAINT `file_versions_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `files` ADD CONSTRAINT `files_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `files` ADD CONSTRAINT `files_folder_id_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `folders` ADD CONSTRAINT `folders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `folders` ADD CONSTRAINT `folders_parent_id_folders_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `pdf_embedding_chunks` ADD CONSTRAINT `pdf_embedding_chunks_job_id_pdf_embedding_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `pdf_embedding_jobs`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `pdf_embedding_chunks` ADD CONSTRAINT `pdf_embedding_chunks_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `pdf_embedding_jobs` ADD CONSTRAINT `pdf_embedding_jobs_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `pdf_embedding_jobs` ADD CONSTRAINT `pdf_embedding_jobs_triggered_by_users_id_fk` FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `share_link_access_logs` ADD CONSTRAINT `share_link_access_logs_link_id_share_links_id_fk` FOREIGN KEY (`link_id`) REFERENCES `share_links`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `share_link_emails` ADD CONSTRAINT `share_link_emails_link_id_share_links_id_fk` FOREIGN KEY (`link_id`) REFERENCES `share_links`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `share_link_otps` ADD CONSTRAINT `share_link_otps_link_id_share_links_id_fk` FOREIGN KEY (`link_id`) REFERENCES `share_links`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `share_links` ADD CONSTRAINT `share_links_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `share_links` ADD CONSTRAINT `share_links_folder_id_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `share_links` ADD CONSTRAINT `share_links_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD CONSTRAINT `upload_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD CONSTRAINT `upload_sessions_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX `idx_email_verification_tokens_user_id` ON `email_verification_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_tokens_user_id` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_file_chunks_file_id` ON `file_chunks` (`file_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_files_user_id` ON `files` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_files_folder_id` ON `files` (`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_files_user_folder` ON `files` (`user_id`,`folder_id`);--> statement-breakpoint
CREATE INDEX `idx_pdf_embedding_chunks_job_id` ON `pdf_embedding_chunks` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_pdf_embedding_chunks_file_id` ON `pdf_embedding_chunks` (`file_id`);--> statement-breakpoint
CREATE INDEX `idx_pdf_embedding_jobs_file_id` ON `pdf_embedding_jobs` (`file_id`);--> statement-breakpoint
CREATE INDEX `idx_access_logs_link_id` ON `share_link_access_logs` (`link_id`);--> statement-breakpoint
CREATE INDEX `idx_share_links_file_id` ON `share_links` (`file_id`);--> statement-breakpoint
CREATE INDEX `idx_upload_sessions_user_file` ON `upload_sessions` (`user_id`,`file_name`,`file_size`,`status`);--> statement-breakpoint
CREATE VECTOR INDEX `idx_pdf_embedding_chunks_embedding` ON `pdf_embedding_chunks` (`embedding`) DISTANCE=cosine;
