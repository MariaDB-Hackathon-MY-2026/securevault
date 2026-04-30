import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  bigint,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import { files } from "@/lib/db/schema/files";
import { mysqlBlob } from "@/lib/db/schema/_custom-types";

export const pdfPreviewPages = mysqlTable(
  "pdf_preview_pages",
  {
    id: varchar("id", { length: 21 }).primaryKey().notNull(),
    file_id: varchar("file_id", { length: 21 })
      .notNull()
      .references(() => files.id, { onDelete: "cascade", onUpdate: "cascade" }),
    page_number: int("page_number").notNull(),
    render_version: int("render_version").notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    mime_type: varchar("mime_type", { length: 64 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    r2_key: varchar("r2_key", { length: 512 }).notNull(),
    iv: mysqlBlob("iv").notNull(),
    auth_tag: mysqlBlob("auth_tag").notNull(),
    status: mysqlEnum("status", ["ready", "failed"]).notNull(),
    error_message: varchar("error_message", { length: 1024 }),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_pdf_preview_file_page_version").on(
      table.file_id,
      table.page_number,
      table.render_version,
    ),
    index("idx_pdf_preview_file_status").on(table.file_id, table.status),
  ],
);

export type PdfPreviewPage = InferSelectModel<typeof pdfPreviewPages>;
export type PdfPreviewPageInsert = InferInsertModel<typeof pdfPreviewPages>;
