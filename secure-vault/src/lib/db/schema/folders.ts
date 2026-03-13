import { type AnyMySqlColumn, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "@/lib/db/schema/users";

export const folders = mysqlTable("folders", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  user_id: varchar("user_id", { length: 21 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  parent_id: varchar("parent_id", { length: 21 }).references((): AnyMySqlColumn => folders.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  deleted_at: timestamp(),
  created_at: timestamp().defaultNow().notNull(),
});
