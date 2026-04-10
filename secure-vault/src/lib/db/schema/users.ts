import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { bigint, boolean, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { mysqlBlob } from "@/lib/db/schema/_custom-types";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 21 }).primaryKey().notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  encrypted_uek: mysqlBlob("encrypted_uek").notNull(),
  storage_used: bigint({ mode: "number" }).default(0).notNull(),
  storage_quota: bigint({ mode: "number" }).default(1073741824).notNull(),
  email_verified: boolean().default(true).notNull(),
  created_at: timestamp().defaultNow().notNull(),
  updated_at: timestamp().defaultNow().onUpdateNow().notNull(),
});

export type users = InferSelectModel<typeof users>;
export type usersInsert = InferInsertModel<typeof users>;


