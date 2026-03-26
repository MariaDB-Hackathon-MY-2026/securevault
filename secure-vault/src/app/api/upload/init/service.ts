import { nanoid } from "nanoid";

import type { CurrentUser } from "@/lib/auth/get-current-user";
import {
  FILE_ID_LENGTH,
  UPLOAD_SESSION_EXPIRY_MS,
  UPLOAD_SESSION_ID_LENGTH,
} from "@/lib/constants";
import { encryptFEK, generateFEK } from "@/lib/crypto";
import { MariadbConnection } from "@/lib/db";
import {
  findExistingActiveUploadForUpdate,
  insertFileRecord,
  insertUploadSessionRecord,
} from "./repository";
import {
  buildUploadInitLockName,
  calculateTotalChunks,
  type InitBody,
} from "./rules";
import type { InitUploadResponse } from "./types";

export { UploadInitServiceError } from "./errors";
export {
  buildUploadInitLockName,
  calculateTotalChunks,
  checkQuotaAndFileSize,
  initBodySchema,
  validateInitBody,
} from "./rules";
export type { InitBody } from "./rules";
export type { InitUploadResponse } from "./types";



export async function initializeUpload(
  user: CurrentUser,
  fileMetaData: InitBody,
): Promise<InitUploadResponse> {

  const currentDate = new Date();
  const { fileName, fileSize } = fileMetaData;
  const totalChunks = calculateTotalChunks(fileSize);
  const expiresAt = new Date(currentDate.getTime() + UPLOAD_SESSION_EXPIRY_MS);

  return MariadbConnection.getConnection().transaction(async (tx) => {
    // Use SELECT ... FOR UPDATE to take a transaction-scoped row lock
    // instead of GET_LOCK which is session-scoped and leaks across pooled connections.
    const existingUpload = await findExistingActiveUploadForUpdate(
      tx,
      user.id,
      fileName,
      fileSize,
      currentDate,
    );

    if (existingUpload) {
      return existingUpload;
    }

    const fileId = nanoid(FILE_ID_LENGTH);
    const uploadId = nanoid(UPLOAD_SESSION_ID_LENGTH);
    const encryptedFek = encryptFEK(generateFEK(), user.uek);

    await insertFileRecord(tx, {
      encryptedFek,
      fileId,
      fileName,
      fileSize,
      totalChunks,
      userId: user.id,
    });

    await insertUploadSessionRecord(tx, {
      expiresAt,
      fileId,
      fileName,
      fileSize,
      totalChunks,
      uploadId,
      userId: user.id,
    });

    return {
      fileId,
      uploadId,
      totalChunks,
    };
  });
}
