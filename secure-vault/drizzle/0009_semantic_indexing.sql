ALTER TABLE `embedding_jobs`
  ADD `attempt_count` int NOT NULL DEFAULT 0,
  ADD `processor_id` varchar(100),
  ADD `last_heartbeat_at` timestamp NULL,
  ADD `lease_expires_at` timestamp NULL;
--> statement-breakpoint

ALTER TABLE `embedding_chunks`
  ADD `chunk_type` enum('full','window','page') NOT NULL DEFAULT 'full';
