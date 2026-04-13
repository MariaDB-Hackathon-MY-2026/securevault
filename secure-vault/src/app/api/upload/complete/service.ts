import { z } from "zod";
import { eq, sql } from "drizzle-orm";

import { CurrentUser } from "@/lib/auth/get-current-user";
import { UPLOAD_SESSION_ID_LENGTH } from "@/lib/constants";
import { MariadbConnection } from "@/lib/db";
import { files, users } from "@/lib/db/schema";
import { uploadSessions } from "@/lib/db/schema/upload-sessions";
import { BodyRequestErrorResponse, TransactionFailureErrorResponse } from "@/app/api/upload/complete/Error";

import type { CompleteUploadResponse } from "@/app/api/upload/complete/types";

const MAX_COMPLETE_TRANSACTION_RETRIES = 3;
const COMPLETE_TRANSACTION_RETRY_DELAY_MS = 50;

type DbConnection = ReturnType<typeof MariadbConnection.getConnection>;
type DbTransaction = Parameters<Parameters<DbConnection["transaction"]>[0]>[0];

const uploadBodySchema = z.object({
  uploadId: z.string().length(UPLOAD_SESSION_ID_LENGTH),
});

export function validateBody(jsonBody: unknown) {
  const { data: validatedBody, error } = uploadBodySchema.safeParse(jsonBody);
  if (error || !validatedBody) {
    throw new BodyRequestErrorResponse("Invalid Body Request Form", 400);
  }
  return { uploadId: validatedBody.uploadId };
}

export async function completeUploadTransaction(
  user: CurrentUser,
  validatedBody: z.infer<typeof uploadBodySchema>,
): Promise<CompleteUploadResponse> {
  let attempt = 0;

  while (true) {
    try {
      const db_conn = MariadbConnection.getConnection();
      return await db_conn.transaction(async (tx) => {
        const session = await findUploadSessionForCompletion(tx, user.id, validatedBody.uploadId);

        if (!session) {
          throw new TransactionFailureErrorResponse("Upload session not found", 404);
        }

        if (session.status !== "uploading") {
          throw new TransactionFailureErrorResponse(
            "Upload session is already completed or has failed",
            409,
          );
        }

        if (session.expires_at < new Date()) {
          throw new TransactionFailureErrorResponse("Upload session has expired", 410);
        }

        if (session.total_chunks !== session.completed_chunks) {
          throw new TransactionFailureErrorResponse("Not all chunks have been uploaded", 409);
        }

        await tx.update(uploadSessions)
          .set({ status: "completed" })
          .where(eq(uploadSessions.id, validatedBody.uploadId));

        const completedAt = new Date();
        await tx.update(files)
          .set({
            status: "ready",
            upload_completed_at: sql`coalesce(${files.upload_completed_at}, ${completedAt})`,
          })
          .where(eq(files.id, session.file_id));

        await tx.update(users)
          .set({ storage_used: sql`${users.storage_used} + ${session.fileSize}` })
          .where(eq(users.id, user.id));

        return { fileId: session.file_id, status: "ready" };
      });
    } catch (error) {
      if (!shouldRetryConcurrentCompleteTransaction(error) || attempt >= MAX_COMPLETE_TRANSACTION_RETRIES) {
        throw error;
      }

      attempt += 1;
      await sleep(COMPLETE_TRANSACTION_RETRY_DELAY_MS * attempt);
    }
  }
}

type CompletionSession = {
  file_id: string;
  fileSize: number;
  status: "uploading" | "completed" | "failed" | "expired";
  total_chunks: number;
  completed_chunks: number;
  expires_at: Date;
};

async function findUploadSessionForCompletion(
  tx: DbTransaction,
  userId: string,
  uploadId: string,
): Promise<CompletionSession | null> {
  const rawResult = await tx.execute(sql`
    SELECT ${uploadSessions.file_id} AS file_id,
           ${uploadSessions.file_size} AS fileSize,
           ${uploadSessions.status} AS status,
           ${uploadSessions.total_chunks} AS total_chunks,
           ${uploadSessions.completed_chunks} AS completed_chunks,
           ${uploadSessions.expires_at} AS expires_at
    FROM ${uploadSessions}
    WHERE ${uploadSessions.id} = ${uploadId}
      AND ${uploadSessions.user_id} = ${userId}
    LIMIT 1
    FOR UPDATE
  `);

  const resultRows = unwrapSelectRows(rawResult) as Array<{
    file_id?: unknown;
    fileSize?: unknown;
    status?: unknown;
    total_chunks?: unknown;
    completed_chunks?: unknown;
    expires_at?: unknown;
  }>;
  const row = resultRows[0];

  if (typeof row?.file_id !== "string" || typeof row?.status !== "string") {
    return null;
  }

  const fileSize = Number(row.fileSize);
  const totalChunks = Number(row.total_chunks);
  const completedChunks = Number(row.completed_chunks);
  const expiresAt = parseCompletionExpiresAt(row.expires_at);

  if (
    !Number.isFinite(fileSize) ||
    !Number.isFinite(totalChunks) ||
    !Number.isFinite(completedChunks) ||
    !expiresAt
  ) {
    return null;
  }

  return {
    file_id: row.file_id,
    fileSize,
    status: row.status as CompletionSession["status"],
    total_chunks: totalChunks,
    completed_chunks: completedChunks,
    expires_at: expiresAt,
  };
}

function parseCompletionExpiresAt(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
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

function shouldRetryConcurrentCompleteTransaction(error: unknown) {
  const { code, sqlState } = getDatabaseErrorDetails(error);

  return code === "ER_LOCK_DEADLOCK" || code === "ER_CHECKREAD" || sqlState === "40001";
}

function getDatabaseErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      code: undefined,
      sqlState: undefined,
    };
  }

  const direct = error as { code?: unknown; sqlState?: unknown; cause?: unknown };
  const nested =
    direct.cause && typeof direct.cause === "object"
      ? direct.cause as { code?: unknown; sqlState?: unknown }
      : undefined;

  return {
    code:
      typeof direct.code === "string"
        ? direct.code
        : typeof nested?.code === "string"
          ? nested.code
          : undefined,
    sqlState:
      typeof direct.sqlState === "string"
        ? direct.sqlState
        : typeof nested?.sqlState === "string"
          ? nested.sqlState
          : undefined,
  };
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
