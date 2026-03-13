import {
  bigint,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { folders } from "@/lib/db/schema/folders";
import { users } from "@/lib/db/schema/users";
import { mysqlBlob } from "@/lib/db/schema/_custom-types";

export const files = mysqlTable(
  "files",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    user_id: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    folder_id: varchar("folder_id", { length: 21 }).references(() => folders.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    mime_type: varchar("mime_type", { length: 255 }).notNull(),
    size: bigint({ mode: "number" }).notNull(),
    total_chunks: int().notNull(),
    encrypted_fek: mysqlBlob("encrypted_fek").notNull(),
    status: mysqlEnum("status", ["uploading", "ready", "failed"]).default("uploading").notNull(),
    has_thumbnail: boolean().default(false).notNull(),
    thumbnail_r2_key: varchar("thumbnail_r2_key", { length: 255 }),
    deleted_at: timestamp(),
    created_at: timestamp().defaultNow().notNull(),
    updated_at: timestamp().defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_files_user_id").on(table.user_id),
    index("idx_files_folder_id").on(table.folder_id),
    index("idx_files_user_folder").on(table.user_id, table.folder_id),
  ],
);
