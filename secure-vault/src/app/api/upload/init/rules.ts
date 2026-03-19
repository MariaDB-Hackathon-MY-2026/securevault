import * as z from "zod";

import type { CurrentUser } from "@/lib/auth/get-current-user";
import { MAX_UPLOAD_SIZE_BYTES, UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/constants";
import { sanitizeFilename } from "@/lib/crypto";

import { UploadInitServiceError } from "./errors";

export const initBodySchema = z.object({
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

export type InitBody = z.infer<typeof initBodySchema>;

export function validateInitBody(body: unknown): InitBody {
  const parsedBody = initBodySchema.safeParse(body);

  if (!parsedBody.success) {
    const message = parsedBody.error.issues[0]?.message ?? "Invalid request body";
    throw new UploadInitServiceError(message, 400);
  }

  return parsedBody.data;
}

export function checkQuotaAndFileSize(
  user: Pick<CurrentUser, "storage_quota" | "storage_used">,
  fileSizeBytes: number,
) {
  if (user.storage_used + fileSizeBytes > user.storage_quota) {
    throw new UploadInitServiceError("Upload exceeded allocated quota", 413);
  }

  if (fileSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    throw new UploadInitServiceError("File size exceeds upload size limit", 413);
  }
}

export function calculateTotalChunks(fileSizeBytes: number) {
  return Math.ceil(fileSizeBytes / UPLOAD_CHUNK_SIZE_BYTES);
}

export function buildUploadInitLockName(userId: string, fileName: string, fileSize: number) {
  return `upload:init:${userId}:${fileName}:${fileSize}`;
}
