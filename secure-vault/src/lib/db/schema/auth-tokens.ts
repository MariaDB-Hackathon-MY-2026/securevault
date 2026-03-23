import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { index, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "@/lib/db/schema/users";

export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    user_id: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    token_hash: varchar("token_hash", { length: 255 }).notNull(),
    expires_at: timestamp().notNull(),
    used_at: timestamp(),
    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [index("idx_password_reset_tokens_user_id").on(table.user_id)],
);

export const emailVerificationTokens = mysqlTable(
  "email_verification_tokens",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    user_id: varchar("user_id", { length: 21 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    token_hash: varchar("token_hash", { length: 255 }).notNull(),
    expires_at: timestamp().notNull(),
    used_at: timestamp(),
    created_at: timestamp().defaultNow().notNull(),
  },
  (table) => [index("idx_email_verification_tokens_user_id").on(table.user_id)],
);

export type passwordResetTokens = InferSelectModel<typeof passwordResetTokens>;
export type passwordResetTokensInsert = InferInsertModel<typeof passwordResetTokens>;
export type emailVerificationTokens = InferSelectModel<typeof emailVerificationTokens>;
export type emailVerificationTokensInsert = InferInsertModel<typeof emailVerificationTokens>;


