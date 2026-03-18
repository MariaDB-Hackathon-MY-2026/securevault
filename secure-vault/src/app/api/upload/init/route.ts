import { NextRequest, NextResponse } from "next/server";

import { and, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as z from "zod";

import { CurrentUser, getCurrentUser } from "@/lib/auth/get-current-user";
import {
  FILE_ID_LENGTH,
  MAX_UPLOAD_SIZE_BYTES,
  PENDING_FILE_MIME_TYPE,
  UPLOAD_CHUNK_SIZE_BYTES,
  UPLOAD_INIT_LOCK_TIMEOUT_SECONDS,
  UPLOAD_SESSION_EXPIRY_MS,
  UPLOAD_SESSION_ID_LENGTH,
} from "@/lib/constants";
import { encryptFEK, generateFEK, sanitizeFilename } from "@/lib/crypto";
import { MariadbConnection } from "@/lib/db";
import { files, uploadSessions } from "@/lib/db/schema";

const initBodySchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "File name is required")
    .transform((filename) => sanitizeFilename(filename))
    .refine((filename) => filename.length > 0, "Invalid file name")
    .refine((filename) => filename.length <= 255, "File name is too long"),
  fileSize: z.number().int().positive("File size must be greater than 0").finite(),
  fileType: z.string().trim().min(1, "File type is required").max(255, "File type is too long"),
});

type InitBody = z.infer<typeof initBodySchema>;
type InitUploadResponse = {
  fileId: string;
  uploadId: string;
  totalChunks: number;
};
type DbTransaction = Parameters<
  Parameters<ReturnType<typeof MariadbConnection.getConnection>["transaction"]>[0]
>[0];

async function validateRequestBody(req: NextRequest): Promise<NextResponse | { data: InitBody }> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return createErrorResponse("Invalid JSON request body", 400);
  }

  const parsedBody = initBodySchema.safeParse(body);

  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0]?.message ?? "Invalid request body";
    return createErrorResponse(message, 400);
  }

  return { data: parsedBody.data };
}

async function checkQuotaAndFileSize(
  user: CurrentUser,
  fileSizeBytes: number,
): Promise<NextResponse | undefined> {
  if (user.storage_used + fileSizeBytes > user.storage_quota) {
    return createErrorResponse("Upload exceeded allocated quota", 413);
  }

  if (fileSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return createErrorResponse("File size exceeds upload size limit", 413);
  }
}

function calculateTotalChunks(fileSizeBytes: InitBody["fileSize"]) {
  return Math.ceil(fileSizeBytes / UPLOAD_CHUNK_SIZE_BYTES);
}

function buildUploadInitLockName(userId: string, fileName: string, fileSize: number) {
  return `upload:init:${userId}:${fileName}:${fileSize}`;
}

async function findExistingActiveUpload(
  tx: DbTransaction,
  userId: string,
  fileName: string,
  fileSize: number,
) {
  const currentDate = new Date();

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

async function initializeUpload(user: CurrentUser, fileMetaData: InitBody): Promise<InitUploadResponse> {
  const fek = generateFEK();
  const encryptedFek = encryptFEK(fek, user.uek);
  const { fileName, fileSize } = fileMetaData;
  const totalChunks = calculateTotalChunks(fileSize);
  const expiresAt = new Date(Date.now() + UPLOAD_SESSION_EXPIRY_MS);
  const db = MariadbConnection.getConnection();

  return db.transaction(async (tx) => {
    const lockName = buildUploadInitLockName(user.id, fileName, fileSize);
    const lockResult = await tx.execute(sql`
      SELECT GET_LOCK(${lockName}, ${UPLOAD_INIT_LOCK_TIMEOUT_SECONDS}) AS acquired
    `);
    const lockRows = lockResult as unknown as Array<{ acquired?: number }>;
    const lockAcquired = Number(lockRows[0]?.acquired ?? 0);

    if (lockAcquired !== 1) {
      throw new Error("Unable to acquire upload init lock");
    }

    try {
      const existingUpload = await findExistingActiveUpload(tx, user.id, fileName, fileSize);

      if (existingUpload) {
        return existingUpload;
      }

      const fileId = nanoid(FILE_ID_LENGTH);
      const uploadId = nanoid(UPLOAD_SESSION_ID_LENGTH);

      await tx.insert(files).values({
        id: fileId,
        user_id: user.id,
        name: fileName,
        mime_type: PENDING_FILE_MIME_TYPE,
        size: fileSize,
        total_chunks: totalChunks,
        encrypted_fek: encryptedFek,
        status: "uploading",
      });

      await tx.insert(uploadSessions).values({
        id: uploadId,
        user_id: user.id,
        file_id: fileId,
        file_name: fileName,
        file_size: fileSize,
        total_chunks: totalChunks,
        completed_chunks: 0,
        status: "uploading",
        expires_at: expiresAt,
      });

      return {
        fileId,
        uploadId,
        totalChunks,
      };
    } finally {
      await tx.execute(sql`
        SELECT RELEASE_LOCK(${lockName}) AS released
      `);
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return createErrorResponse("Invalid credentials", 401);
    }

    const validatedRequestBody = await validateRequestBody(req);

    if (validatedRequestBody instanceof NextResponse) {
      return validatedRequestBody;
    }

    const { data: parsedBody } = validatedRequestBody;
    const checksResult = await checkQuotaAndFileSize(user, parsedBody.fileSize);

    if (checksResult) {
      return checksResult;
    }

    const uploadSessionRecord = await initializeUpload(user, parsedBody);
    return constructResponse(
      uploadSessionRecord.fileId,
      uploadSessionRecord.uploadId,
      uploadSessionRecord.totalChunks,
    );
  } catch (error) {
    console.error("Upload init failed", error);

    if (error instanceof Error && error.message === "Unable to acquire upload init lock") {
      return createErrorResponse("Upload initialization is already in progress. Please retry.", 409);
    }

    return createErrorResponse("Failed to initialize upload", 500);
  }
}

function constructResponse(fileId: string, uploadId: string, totalChunks: number) {
  return NextResponse.json(
    {
      fileId,
      uploadId,
      totalChunks,
    },
    { status: 200 },
  );
}

function createErrorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
