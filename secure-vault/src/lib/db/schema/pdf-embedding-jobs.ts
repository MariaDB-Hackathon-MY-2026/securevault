import { bigint, index, int, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { files } from "@/lib/db/schema/files";
import { users } from "@/lib/db/schema/users";

export const pdfEmbeddingJobs = mysqlTable(
  "pdf_embedding_jobs",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    file_id: varchar("file_id", { length: 21 })
      .notNull()
      .references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" }),
    status: mysqlEnum("status", ["queued", "processing", "ready", "skipped", "failed"])
      .default("queued")
      .notNull(),
    mime_type: varchar("mime_type", { length: 255 }).notNull(),
    file_size: bigint({ mode: "number" }).notNull(),
    embedding_model: varchar("embedding_model", { length: 100 }).notNull(),
    embedding_dimensions: int().default(1536).notNull(),
    ocr_provider: varchar("ocr_provider", { length: 100 }),
    error_code: varchar("error_code", { length: 100 }),
    error_message: varchar("error_message", { length: 1024 }),
    triggered_by: varchar("triggered_by", { length: 21 }).references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    started_at: timestamp(),
    completed_at: timestamp(),
    created_at: timestamp().defaultNow().notNull(),
    updated_at: timestamp().defaultNow().onUpdateNow().notNull(),
  },
  (table) => [index("idx_pdf_embedding_jobs_file_id").on(table.file_id)],
);
