import { and, asc, eq } from "drizzle-orm";

import type { UploadStatusResponse } from "./types";
import { z } from "zod";

import type { CurrentUser } from "@/lib/auth/get-current-user";
import { MariadbConnection } from "@/lib/db";
import { fileChunks, uploadSessions } from "@/lib/db/schema";

const uploadStatusSearchParamsSchema = z.object({
  uploadId: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : ""),
    z.string().length(21, "uploadId must be a valid upload session id"),
  ),
});

export type UploadStatusInput = z.infer<typeof uploadStatusSearchParamsSchema>;


export class UploadStatusServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadStatusServiceError";
    this.status = status;
  }
}

export function validateUploadStatusSearchParams(
  searchParams: URLSearchParams,
): UploadStatusInput {
  const parsedParams = uploadStatusSearchParamsSchema.safeParse({
    uploadId: searchParams.get("uploadId"),
  });

  if (!parsedParams.success) {
    const message = parsedParams.error.issues[0]?.message ?? "Invalid request parameters";
    throw new UploadStatusServiceError(message, 400);
  }

  return parsedParams.data;
}

export async function getUploadStatus(
  user: Pick<CurrentUser, "id">,
  input: UploadStatusInput,
): Promise<UploadStatusResponse> {
  const db = MariadbConnection.getConnection();
  const [uploadSession] = await db
    .select({
      expiresAt: uploadSessions.expires_at,
      fileId: uploadSessions.file_id,
      status: uploadSessions.status,
      totalChunks: uploadSessions.total_chunks,
      uploadId: uploadSessions.id,
    })
    .from(uploadSessions)
    .where(and(eq(uploadSessions.id, input.uploadId), eq(uploadSessions.user_id, user.id)))
    .limit(1);

  if (!uploadSession) {
    throw new UploadStatusServiceError("Upload session not found", 404);
  }

  if (uploadSession.expiresAt < new Date()) {
    return {
      completedChunkIndexes: [],
      fileId: uploadSession.fileId,
      status: "expired",
      totalChunks: uploadSession.totalChunks,
      uploadId: uploadSession.uploadId,
    };
  }

  const uploadedChunks = await db
    .select({
      chunkIndex: fileChunks.chunk_index,
    })
    .from(fileChunks)
    .where(eq(fileChunks.file_id, uploadSession.fileId))
    .orderBy(asc(fileChunks.chunk_index));

  return {
    completedChunkIndexes: uploadedChunks.map((chunk) => chunk.chunkIndex),
    fileId: uploadSession.fileId,
    status: uploadSession.status,
    totalChunks: uploadSession.totalChunks,
    uploadId: uploadSession.uploadId,
  };
}



