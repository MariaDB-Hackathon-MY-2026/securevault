import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { pdfPreviewPages, type PdfPreviewPage } from "@/lib/db/schema";

type PreviewPageStatus = PdfPreviewPage["status"];

const EMPTY_IV = Buffer.alloc(12);
const EMPTY_AUTH_TAG = Buffer.alloc(16);

export async function getPreviewPage(input: {
  fileId: string;
  pageNumber: number;
  renderVersion: number;
}): Promise<PdfPreviewPage | null> {
  const db = MariadbConnection.getConnection();
  const [page] = await db
    .select()
    .from(pdfPreviewPages)
    .where(
      and(
        eq(pdfPreviewPages.file_id, input.fileId),
        eq(pdfPreviewPages.page_number, input.pageNumber),
        eq(pdfPreviewPages.render_version, input.renderVersion),
      ),
    )
    .limit(1);

  return page ?? null;
}

export async function listPreviewPages(input: {
  fileId: string;
  renderVersion: number;
}): Promise<PdfPreviewPage[]> {
  const db = MariadbConnection.getConnection();

  return db
    .select()
    .from(pdfPreviewPages)
    .where(
      and(
        eq(pdfPreviewPages.file_id, input.fileId),
        eq(pdfPreviewPages.render_version, input.renderVersion),
      ),
    );
}

export async function insertReadyPreviewPage(input: {
  authTag: Buffer;
  fileId: string;
  height: number;
  id: string;
  iv: Buffer;
  mimeType: "image/webp";
  pageNumber: number;
  r2Key: string;
  renderVersion: number;
  size: number;
  width: number;
}): Promise<void> {
  const db = MariadbConnection.getConnection();

  await db.insert(pdfPreviewPages).values({
    auth_tag: input.authTag,
    error_message: null,
    file_id: input.fileId,
    height: input.height,
    id: input.id,
    iv: input.iv,
    mime_type: input.mimeType,
    page_number: input.pageNumber,
    r2_key: input.r2Key,
    render_version: input.renderVersion,
    size: input.size,
    status: "ready",
    width: input.width,
  });
}

export async function markPreviewPageFailed(input: {
  errorMessage: string;
  fileId: string;
  pageNumber: number;
  renderVersion: number;
}): Promise<void> {
  const db = MariadbConnection.getConnection();
  const existingPage = await getPreviewPage({
    fileId: input.fileId,
    pageNumber: input.pageNumber,
    renderVersion: input.renderVersion,
  });

  if (existingPage) {
    await db
      .update(pdfPreviewPages)
      .set({
        error_message: input.errorMessage,
        status: "failed" satisfies PreviewPageStatus,
      })
      .where(eq(pdfPreviewPages.id, existingPage.id));
    return;
  }

  await db.insert(pdfPreviewPages).values({
    auth_tag: EMPTY_AUTH_TAG,
    error_message: input.errorMessage,
    file_id: input.fileId,
    height: 0,
    id: `failed-${input.renderVersion}-${input.pageNumber}`.slice(0, 21),
    iv: EMPTY_IV,
    mime_type: "image/webp",
    page_number: input.pageNumber,
    r2_key: "",
    render_version: input.renderVersion,
    size: 0,
    status: "failed",
    width: 0,
  });
}

export async function listPreviewPagesForFiles(fileIds: string[]): Promise<PdfPreviewPage[]> {
  if (fileIds.length === 0) {
    return [];
  }

  const db = MariadbConnection.getConnection();

  return db.select().from(pdfPreviewPages).where(inArray(pdfPreviewPages.file_id, fileIds));
}

export function isDuplicatePreviewPageInsertError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === "ER_DUP_ENTRY") {
    return true;
  }

  if ("cause" in error) {
    return isDuplicatePreviewPageInsertError(error.cause);
  }

  return false;
}
