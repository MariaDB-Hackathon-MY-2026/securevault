import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { decryptFEK } from "@/lib/crypto";
import { MariadbConnection } from "@/lib/db";
import { fileChunks, files } from "@/lib/db/schema";
import { createDecryptStream } from "@/lib/crypto";
import { getObjectStream } from "@/lib/storage/r2";
import { EmbeddingError } from "@/lib/ai/embeddings/errors";

export type DecryptableFileChunk = {
  authTag: Buffer;
  chunkIndex: number;
  iv: Buffer;
  r2Key: string;
};

export type DecryptableFileRecord = {
  chunks: DecryptableFileChunk[];
  encryptedFek: Buffer;
  mimeType: string;
  name: string;
  size: number;
  totalChunks: number;
};

async function collectStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value.byteLength > 0) {
      chunks.push(Buffer.from(value));
    }
  }

  return Buffer.concat(chunks);
}

export function validateDecryptableFileChunks(chunks: DecryptableFileChunk[], totalChunks: number) {
  if (chunks.length === 0 || totalChunks <= 0) {
    throw new EmbeddingError("R2_READ_FAILED", "File chunks are missing.");
  }

  if (chunks.length !== totalChunks) {
    throw new EmbeddingError("R2_READ_FAILED", "File chunk metadata is incomplete.");
  }

  for (const [index, chunk] of chunks.entries()) {
    if (chunk.chunkIndex !== index) {
      throw new EmbeddingError("R2_READ_FAILED", "File chunk metadata is inconsistent.");
    }
  }
}

export async function findOwnedDecryptableFile(
  userId: string,
  fileId: string,
): Promise<DecryptableFileRecord | null> {
  const db = MariadbConnection.getConnection();
  const [fileRecord] = await db
    .select({
      encryptedFek: files.encrypted_fek,
      mimeType: files.mime_type,
      name: files.name,
      size: files.size,
      totalChunks: files.total_chunks,
    })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.user_id, userId),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
      ),
    )
    .limit(1);

  if (!fileRecord) {
    return null;
  }

  const chunkRecords = await db
    .select({
      authTag: fileChunks.auth_tag,
      chunkIndex: fileChunks.chunk_index,
      iv: fileChunks.iv,
      r2Key: fileChunks.r2_key,
    })
    .from(fileChunks)
    .where(eq(fileChunks.file_id, fileId))
    .orderBy(asc(fileChunks.chunk_index));

  return {
    chunks: chunkRecords,
    encryptedFek: fileRecord.encryptedFek,
    mimeType: fileRecord.mimeType,
    name: fileRecord.name,
    size: fileRecord.size,
    totalChunks: fileRecord.totalChunks,
  };
}

export async function readOwnedFileBytes(input: {
  fileId: string;
  signal?: AbortSignal;
  uek: Buffer;
  userId: string;
}) {
  const file = await findOwnedDecryptableFile(input.userId, input.fileId);

  if (!file) {
    return null;
  }

  validateDecryptableFileChunks(file.chunks, file.totalChunks);

  let fek: Buffer;
  try {
    fek = decryptFEK(file.encryptedFek, input.uek);
  } catch (error) {
    throw new EmbeddingError("DECRYPT_FAILED", "Failed to decrypt the file encryption key.", {
      cause: error,
      retryable: false,
    });
  }

  try {
    const chunkBuffers: Buffer[] = [];

    for (const chunk of file.chunks) {
      const encryptedStream = await getObjectStream(chunk.r2Key, input.signal);
      const decryptedStream = encryptedStream.pipeThrough(
        createDecryptStream(fek, chunk.iv, chunk.authTag),
      );

      chunkBuffers.push(await collectStream(decryptedStream));
    }

    return {
      bytes: Buffer.concat(chunkBuffers),
      file,
    };
  } catch (error) {
    if (error instanceof EmbeddingError) {
      throw error;
    }

    if (error instanceof Error && error.message.toLowerCase().includes("decrypt")) {
      throw new EmbeddingError("DECRYPT_FAILED", "Failed to decrypt file contents.", {
        cause: error,
        retryable: false,
      });
    }

    throw new EmbeddingError("R2_READ_FAILED", "Failed to read file contents from object storage.", {
      cause: error,
    });
  }
}
