import { index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { files } from "@/lib/db/schema/files";
import { pdfEmbeddingJobs } from "@/lib/db/schema/pdf-embedding-jobs";
import { mysqlBlob, mysqlLongBlob, mysqlVector1536 } from "@/lib/db/schema/_custom-types";

export const pdfEmbeddingChunks = mysqlTable(
  "pdf_embedding_chunks",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    job_id: varchar("job_id", { length: 21 })
      .notNull()
      .references(() => pdfEmbeddingJobs.id, { onDelete: "cascade", onUpdate: "cascade" }),
    file_id: varchar("file_id", { length: 21 })
      .notNull()
      .references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" }),
    chunk_index: int().notNull(),
    page_from: int().notNull(),
    page_to: int().notNull(),
    char_count: int().notNull(),
    encrypted_text: mysqlLongBlob("encrypted_text").notNull(),
    text_iv: mysqlBlob("text_iv").notNull(),
    text_auth_tag: mysqlBlob("text_auth_tag").notNull(),
    embedding: mysqlVector1536("embedding").notNull(),
  },
  (table) => [
    index("idx_pdf_embedding_chunks_job_id").on(table.job_id),
    index("idx_pdf_embedding_chunks_file_id").on(table.file_id),
  ],
);

