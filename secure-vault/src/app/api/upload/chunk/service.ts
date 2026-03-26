import { and, eq, gt, sql } from "drizzle-orm";

import type { UploadChunkResponse } from "./types";
import { fileTypeFromBuffer } from "file-type";
import { nanoid } from "nanoid";

import type { CurrentUser } from "@/lib/auth/get-current-user";
import { isAllowedFileType } from "@/lib/constants";
import { createEncryptStream, decryptFEK } from "@/lib/crypto";
import { MariadbConnection } from "@/lib/db";
import { fileChunks, files, uploadSessions } from "@/lib/db/schema";
import { buildR2Key, deleteObject, putObjectStream } from "@/lib/storage/r2";

const MIME_SNIFF_BYTES = 4096;


type DbConnection = ReturnType<typeof MariadbConnection.getConnection>;
type DbTransaction = Parameters<Parameters<DbConnection["transaction"]>[0]>[0];

type UploadChunkInput = {
  body: ReadableStream<Uint8Array> | null;
  headers: Headers;
  user: CurrentUser;
};

type UploadSessionContext = {
  encryptedFek: Buffer;
  fileId: string;
  totalChunks: number;
  uploadId: string;
};

type PreparedChunkStream = {
  detectedMimeType: string | null;
  stream: ReadableStream<Uint8Array>;
};

type PersistChunkUploadInput = {
  chunkIndex: number;
  detectedMimeType: string | null;
  encryptor: ReturnType<typeof createEncryptStream>;
  fileId: string;
  r2Key: string;
  uploadId: string;
};

export type ParsedChunkHeaders = {
  chunkIndex: number;
  uploadId: string;
};


export class UploadChunkServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UploadChunkServiceError";
    this.status = status;
  }
}

export async function uploadChunk({
  body,
  headers,
  user,
}: UploadChunkInput): Promise<UploadChunkResponse> {
  const { chunkIndex, uploadId } = parseChunkHeaders(headers);

  if (!body) {
    throw new UploadChunkServiceError("Chunk request body is required", 400);
  }

  const db = MariadbConnection.getConnection();

  return db.transaction(async (tx) => {
    const uploadSession = await findUploadSession(tx, user.id, uploadId);

    if (!uploadSession) {
      throw new UploadChunkServiceError("Upload session not found or expired", 404);
    }

    if (chunkIndex >= uploadSession.totalChunks) {
      throw new UploadChunkServiceError("Chunk index is out of range", 400);
    }

    if (await isChunkAlreadyUploaded(tx, uploadSession.fileId, chunkIndex)) {
      throw new UploadChunkServiceError("Chunk already uploaded", 409);
    }

    const { detectedMimeType, stream } = await prepareChunkStream(body, chunkIndex);
    const decryptedFek = decryptFEK(uploadSession.encryptedFek, user.uek);
    const encryptor = createEncryptStream(decryptedFek);
    const encryptedStream = stream.pipeThrough(encryptor.stream);
    const r2Key = buildR2Key(user.id, uploadSession.fileId, chunkIndex);

    await putObjectStream(r2Key, encryptedStream as any);

    try {
      await persistChunkUpload(tx, {
        chunkIndex,
        detectedMimeType,
        encryptor,
        fileId: uploadSession.fileId,
        r2Key,
        uploadId,
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        throw new UploadChunkServiceError("Chunk already uploaded", 409);
      }

      await cleanupUploadedChunk(r2Key);
      throw error;
    }

    return {
      chunkIndex,
      status: "uploaded",
    };
  });
}

export function parseChunkHeaders(headers: Headers): ParsedChunkHeaders {
  const uploadId = headers.get("x-upload-id")?.trim();

  if (!uploadId) {
    throw new UploadChunkServiceError("x-upload-id header is required", 400);
  }

  const chunkIndexHeader = headers.get("x-chunk-index")?.trim();

  if (!chunkIndexHeader) {
    throw new UploadChunkServiceError("x-chunk-index header is required", 400);
  }

  if (!/^\d+$/.test(chunkIndexHeader)) {
    throw new UploadChunkServiceError(
      "x-chunk-index header must be a non-negative integer",
      400,
    );
  }

  return {
    chunkIndex: Number(chunkIndexHeader),
    uploadId,
  };
}



async function findUploadSession(
  db: DbTransaction,
  userId: string,
  uploadId: string,
): Promise<UploadSessionContext | null> {
  const currentDate = new Date();
  const result = await db
    .select({
      encryptedFek: files.encrypted_fek,
      fileId: uploadSessions.file_id,
      totalChunks: uploadSessions.total_chunks,
      uploadId: uploadSessions.id,
    })
    .from(uploadSessions)
    .innerJoin(files, eq(uploadSessions.file_id, files.id))
    .where(
      and(
        eq(uploadSessions.id, uploadId),
        eq(uploadSessions.user_id, userId),
        eq(uploadSessions.status, "uploading"),
        gt(uploadSessions.expires_at, currentDate),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

async function isChunkAlreadyUploaded(
  db: DbTransaction,
  fileId: string,
  chunkIndex: number,
) {
  const result = await db
    .select({ id: fileChunks.id })
    .from(fileChunks)
    .where(and(eq(fileChunks.file_id, fileId), eq(fileChunks.chunk_index, chunkIndex)))
    .limit(1);

  return result.length > 0;
}

async function prepareChunkStream(
  body: ReadableStream<Uint8Array>,
  chunkIndex: number,
): Promise<PreparedChunkStream> {
  if (chunkIndex !== 0) {
    return {
      detectedMimeType: null,
      stream: body,
    };
  }

  const { sniffBuffer, stream } = await bufferStreamPrefix(body, MIME_SNIFF_BYTES);

  if (sniffBuffer.length === 0) {
    throw new UploadChunkServiceError("Chunk request body is empty", 400);
  }

  const fileType = await fileTypeFromBuffer(sniffBuffer);
  const detectedMimeType = fileType?.mime;

  if (!detectedMimeType) {
    throw new UploadChunkServiceError("Unsupported or unrecognized file type", 415);
  }

  if (!isAllowedFileType(detectedMimeType)) {
    throw new UploadChunkServiceError(`File type ${detectedMimeType} is not allowed`, 415);
  }

  return {
    detectedMimeType,
    stream,
  };
}

async function bufferStreamPrefix(
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
) {
  const reader = source.getReader();
  const replayChunks: Uint8Array[] = [];
  const sniffChunks: Uint8Array[] = [];
  let sniffedBytes = 0;

  while (sniffedBytes < maxBytes) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!value || value.byteLength === 0) {
      continue;
    }

    replayChunks.push(value);

    const remainingBytes = maxBytes - sniffedBytes;
    const sniffChunk =
      value.byteLength <= remainingBytes ? value : value.subarray(0, remainingBytes);

    sniffChunks.push(sniffChunk);
    sniffedBytes += sniffChunk.byteLength;
  }

  return {
    sniffBuffer: Buffer.concat(sniffChunks.map((chunk) => Buffer.from(chunk))),
    stream: new ReadableStream<Uint8Array>({
      cancel(reason) {
        return reader.cancel(reason);
      },
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            return;
          }

          if (!value || value.byteLength === 0) {
            continue;
          }

          controller.enqueue(value);
          return;
        }
      },
      start(controller) {
        for (const chunk of replayChunks) {
          controller.enqueue(chunk);
        }
      },
    }),
  };
}

async function persistChunkUpload(tx: DbTransaction, input: PersistChunkUploadInput) {
  await tx.insert(fileChunks).values({
    auth_tag: input.encryptor.getAuthTag(),
    chunk_index: input.chunkIndex,
    file_id: input.fileId,
    id: nanoid(),
    iv: input.encryptor.getIV(),
    r2_key: input.r2Key,
  });

  await tx
    .update(uploadSessions)
    .set({
      completed_chunks: sql`${uploadSessions.completed_chunks} + 1`,
    })
    .where(eq(uploadSessions.id, input.uploadId));

  if (input.detectedMimeType) {
    await tx
      .update(files)
      .set({ mime_type: input.detectedMimeType })
      .where(eq(files.id, input.fileId));
  }
}

function isDuplicateEntryError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === "ER_DUP_ENTRY") {
    return true;
  }

  if ("cause" in error) {
    return isDuplicateEntryError(error.cause);
  }

  return false;
}

async function cleanupUploadedChunk(r2Key: string) {
  try {
    await deleteObject(r2Key);
  } catch (cleanupError) {
    console.error("Failed to clean up uploaded chunk after a persistence error", cleanupError);
  }
}

