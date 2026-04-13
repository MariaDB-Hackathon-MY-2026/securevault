import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { boolean, index, int, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { files } from "@/lib/db/schema/files";
import { folders } from "@/lib/db/schema/folders";
import { users } from "@/lib/db/schema/users";

export const shareLinks = mysqlTable(
  "share_links",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    file_id: varchar("file_id", { length: 21 }).references(() => files.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    folder_id: varchar("folder_id", { length: 21 }).references(() => folders.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    created_by: varchar("created_by", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    token: varchar("token", { length: 255 }).notNull(),
    expires_at: timestamp(),
    max_downloads: int(),
    download_count: int().default(0).notNull(),
    is_public: boolean().default(false).notNull(),
    revoked_at: timestamp(),
    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_share_links_token").on(table.token),
    index("idx_share_links_file_id").on(table.file_id),
    index("idx_share_links_folder_id").on(table.folder_id),
    index("idx_share_links_owner_created_id").on(table.created_by, table.created_at, table.id),
    index("idx_share_links_owner_revoked_id").on(table.created_by, table.revoked_at, table.id),
    index("idx_share_links_owner_target_ids").on(table.created_by, table.id, table.file_id, table.folder_id),
  ],
);

export const shareLinkEmails = mysqlTable("share_link_emails", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  link_id: varchar("link_id", { length: 21 })
    .notNull()
    .references(() => shareLinks.id, { onDelete: "cascade", onUpdate: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  created_at: timestamp().defaultNow().notNull(),
});

export const shareLinkOtps = mysqlTable("share_link_otps", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  link_id: varchar("link_id", { length: 21 })
    .notNull()
    .references(() => shareLinks.id, { onDelete: "cascade", onUpdate: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  otp_hash: varchar("otp_hash", { length: 255 }).notNull(),
  attempt_count: int().default(0).notNull(),
  expires_at: timestamp().notNull(),
  used_at: timestamp(),
  created_at: timestamp().defaultNow().notNull(),
});

export const shareLinkAccessLogs = mysqlTable(
  "share_link_access_logs",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    link_id: varchar("link_id", { length: 21 })
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade", onUpdate: "cascade" }),
    ip_address: varchar("ip_address", { length: 50 }).notNull(),
    user_agent: varchar("user_agent", { length: 255 }),
    email: varchar("email", { length: 255 }),
    accessed_at: timestamp().defaultNow().notNull(),
  },
  (table) => [
    index("idx_access_logs_link_id").on(table.link_id),
    index("idx_access_logs_link_accessed_id").on(table.link_id, table.accessed_at, table.id),
  ],
);

export type shareLinks = InferSelectModel<typeof shareLinks>;
export type shareLinksInsert = InferInsertModel<typeof shareLinks>;
export type shareLinkEmails = InferSelectModel<typeof shareLinkEmails>;
export type shareLinkEmailsInsert = InferInsertModel<typeof shareLinkEmails>;
export type shareLinkOtps = InferSelectModel<typeof shareLinkOtps>;
export type shareLinkOtpsInsert = InferInsertModel<typeof shareLinkOtps>;
export type shareLinkAccessLogs = InferSelectModel<typeof shareLinkAccessLogs>;
export type shareLinkAccessLogsInsert = InferInsertModel<typeof shareLinkAccessLogs>;


