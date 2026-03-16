import { index, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "@/lib/db/schema/users";

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    user_id: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    session_token_hash: varchar("session_token_hash", { length: 255 }).notNull(),
    refresh_token_hash: varchar("refresh_token_hash", { length: 255 }).notNull(),
    device_name: varchar("device_name", { length: 50 }).notNull(),
    ip_address: varchar("ip_address", { length: 50 }).notNull(),
    session_expires_at: timestamp().notNull(),
    refresh_expires_at: timestamp().notNull(),
    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [index("idx_sessions_user_id").on(table.user_id)],
);

