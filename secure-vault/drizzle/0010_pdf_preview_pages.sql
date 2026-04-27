CREATE TABLE `pdf_preview_pages` (
  `id` varchar(21) NOT NULL,
  `file_id` varchar(21) NOT NULL,
  `page_number` int NOT NULL,
  `render_version` int NOT NULL,
  `width` int NOT NULL,
  `height` int NOT NULL,
  `mime_type` varchar(64) NOT NULL,
  `size` bigint NOT NULL,
  `r2_key` varchar(512) NOT NULL,
  `iv` blob NOT NULL,
  `auth_tag` blob NOT NULL,
  `status` enum('ready','failed') NOT NULL,
  `error_message` varchar(1024),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pdf_preview_pages_id` PRIMARY KEY (`id`),
  CONSTRAINT `pdf_preview_pages_file_id_files_id_fk`
    FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE cascade ON UPDATE cascade
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
--> statement-breakpoint

CREATE UNIQUE INDEX `uq_pdf_preview_file_page_version`
  ON `pdf_preview_pages` (`file_id`,`page_number`,`render_version`);
--> statement-breakpoint

CREATE INDEX `idx_pdf_preview_file_status`
  ON `pdf_preview_pages` (`file_id`,`status`);
