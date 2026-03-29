import { and, eq, gt, sql } from "drizzle-orm";

import { PENDING_FILE_MIME_TYPE } from "@/lib/constants";
import { files, uploadSessions } from "@/lib/db/schema";

import type { DbTransaction, InitUploadResponse } from "./types";

export async function findExistingActiveUpload(
  tx: DbTransaction,
  userId: string,
  fileName: string,
  fileSize: number,
  currentDate: Date,
): Promise<InitUploadResponse | null> {
  const existingUpload = await tx
    .select({
      fileId: uploadSessions.file_id,
      uploadId: uploadSessions.id,
      totalChunks: uploadSessions.total_chunks,
    })
    .from(uploadSessions)
    .where(
      and(
        eq(uploadSessions.user_id, userId),
        eq(uploadSessions.file_name, fileName),
        eq(uploadSessions.file_size, fileSize),
        eq(uploadSessions.status, "uploading"),
        gt(uploadSessions.expires_at, currentDate),
      ),
    )
    .limit(1);

  return existingUpload[0] ?? null;
}

export async function findExistingActiveUploadForUpdate(
  tx: DbTransaction,
  userId: string,
  fileName: string,
  fileSize: number,
  currentDate: Date,
): Promise<InitUploadResponse | null> {
  const rawResult = await tx.execute(sql`
    SELECT ${uploadSessions.file_id} AS fileId,
           ${uploadSessions.id} AS uploadId,
           ${uploadSessions.total_chunks} AS totalChunks
    FROM ${uploadSessions}
    WHERE ${uploadSessions.user_id} = ${userId}
      AND ${uploadSessions.file_name} = ${fileName}
      AND ${uploadSessions.file_size} = ${fileSize}
      AND ${uploadSessions.status} = 'uploading'
      AND ${uploadSessions.expires_at} > ${currentDate}
    LIMIT 1
    FOR UPDATE
  `);

  const resultRows = unwrapSelectRows(rawResult) as Array<{
    fileId?: string;
    uploadId?: string;
    totalChunks?: number;
  }>;

  const row = resultRows[0];

  if (!row?.fileId || !row?.uploadId || row?.totalChunks == null) {
    return null;
  }

  return {
    fileId: row.fileId,
    uploadId: row.uploadId,
    totalChunks: row.totalChunks,
  };
}

function unwrapSelectRows(result: unknown): unknown[] {
  if (!Array.isArray(result)) {
    return [];
  }

  const [rows] = result;

  if (Array.isArray(rows)) {
    return rows;
  }

  return result;
}

type InsertFileRecordInput = {
  encryptedFek: Buffer;
  fileId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  userId: string;
};

export async function insertFileRecord(tx: DbTransaction, input: InsertFileRecordInput) {
  await tx.insert(files).values({
    id: input.fileId,
    user_id: input.userId,
    name: input.fileName,
    mime_type: PENDING_FILE_MIME_TYPE,
    size: input.fileSize,
    total_chunks: input.totalChunks,
    encrypted_fek: input.encryptedFek,
    status: "uploading",
  });
}

type InsertUploadSessionRecordInput = {
  expiresAt: Date;
  fileId: string;
  fileName: string;
  fileSize: number;
  totalChunks: number;
  uploadId: string;
  userId: string;
};

export async function insertUploadSessionRecord(
  tx: DbTransaction,
  input: InsertUploadSessionRecordInput,
) {
  await tx.insert(uploadSessions).values({
    id: input.uploadId,
    user_id: input.userId,
    file_id: input.fileId,
    file_name: input.fileName,
    file_size: input.fileSize,
    total_chunks: input.totalChunks,
    completed_chunks: 0,
    status: "uploading",
    expires_at: input.expiresAt,
  });
}
