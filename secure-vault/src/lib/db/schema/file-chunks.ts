import { index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { files } from "@/lib/db/schema/files";
import { mysqlBlob } from "@/lib/db/schema/_custom-types";

export const fileChunks = mysqlTable(
  "file_chunks",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    file_id: varchar("file_id", { length: 21 })
      .notNull()
      .references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" }),
    chunk_index: int().notNull(),
    r2_key: varchar("r2_key", { length: 512 }).notNull(),
    iv: mysqlBlob("iv").notNull(),
    auth_tag: mysqlBlob("auth_tag").notNull(),
  },
  (table) => [index("idx_file_chunks_file_id").on(table.file_id)],
);
