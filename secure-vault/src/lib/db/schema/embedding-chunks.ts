import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, int, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { files } from "@/lib/db/schema/files";
import { embeddingJobs } from "@/lib/db/schema/embedding-jobs";
import { mysqlBlob, mysqlLongBlob, mysqlVector1536 } from "@/lib/db/schema/_custom-types";

export const embeddingChunks = mysqlTable(
  "embedding_chunks",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    job_id: varchar("job_id", { length: 21 })
      .notNull()
      .references(() => embeddingJobs.id, { onDelete: "cascade", onUpdate: "cascade" }),
    file_id: varchar("file_id", { length: 21 })
      .notNull()
      .references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" }),
    chunk_index: int().notNull(),
    modality: mysqlEnum("modality", ["pdf", "image"]).default("pdf").notNull(),
    page_from: int(),
    page_to: int(),
    char_count: int(),
    encrypted_text: mysqlLongBlob("encrypted_text"),
    text_iv: mysqlBlob("text_iv"),
    text_auth_tag: mysqlBlob("text_auth_tag"),
    embedding: mysqlVector1536("embedding").notNull(),
  },
  (table) => [
    uniqueIndex("uq_embedding_chunks_job_chunk").on(table.job_id, table.chunk_index),
    index("idx_embedding_chunks_file_id").on(table.file_id),
  ],
);

export type embeddingChunks = InferSelectModel<typeof embeddingChunks>;
export type embeddingChunksInsert = InferInsertModel<typeof embeddingChunks>;


