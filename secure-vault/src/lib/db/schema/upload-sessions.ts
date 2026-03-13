import { bigint, index, int, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { files } from "@/lib/db/schema/files";
import { users } from "@/lib/db/schema/users";

export const uploadSessions = mysqlTable(
  "upload_sessions",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    user_id: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    file_id: varchar("file_id", { length: 21 }).references(() => files.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    file_name: varchar("file_name", { length: 255 }).notNull(),
    file_size: bigint({ mode: "number" }).notNull(),
    total_chunks: int().notNull(),
    completed_chunks: int().default(0).notNull(),
    status: mysqlEnum("status", ["uploading", "completed", "failed", "expired"])
      .default("uploading")
      .notNull(),
    expires_at: timestamp().notNull(),
    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index("idx_upload_sessions_user_file").on(
      table.user_id,
      table.file_name,
      table.file_size,
      table.status,
    ),
  ],
);
