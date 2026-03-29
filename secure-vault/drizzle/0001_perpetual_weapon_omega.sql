ALTER TABLE `upload_sessions` DROP FOREIGN KEY `upload_sessions_file_id_files_id_fk`;
--> statement-breakpoint
ALTER TABLE `upload_sessions` MODIFY COLUMN `file_id` varchar(21) NOT NULL;--> statement-breakpoint
ALTER TABLE `upload_sessions` ADD CONSTRAINT `upload_sessions_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE cascade ON UPDATE cascade;