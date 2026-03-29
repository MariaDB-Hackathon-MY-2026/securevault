import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { int, mysqlTable, timestamp, uniqueIndex, varchar, bigint } from "drizzle-orm/mysql-core";
import { files } from "@/lib/db/schema/files";
import { mysqlBlob } from "@/lib/db/schema/_custom-types";

export const fileVersions = mysqlTable(
  "file_versions",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    file_id: varchar("file_id", { length: 21 })
      .notNull()
      .references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" }),
    version_number: int().notNull(),
    size: bigint({ mode: "number" }).notNull(),
    total_chunks: int().notNull(),
    encrypted_fek: mysqlBlob("encrypted_fek").notNull(),
    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [uniqueIndex("uq_file_versions_file_version").on(table.file_id, table.version_number)],
);

export type fileVersions = InferSelectModel<typeof fileVersions>;
export type fileVersionsInsert = InferInsertModel<typeof fileVersions>;


