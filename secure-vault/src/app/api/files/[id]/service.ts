import { asc, and, eq, isNull } from "drizzle-orm";

import type { CurrentUser } from "@/lib/auth/get-current-user";
import { createDecryptStream, decryptFEK, sanitizeFilename } from "@/lib/crypto";
import { MariadbConnection } from "@/lib/db";
import { fileChunks, files } from "@/lib/db/schema";
import { canPreviewMime } from "@/lib/files/preview";
import { getObjectStream } from "@/lib/storage/r2";

type DownloadDisposition = "attachment" | "inline";

type DownloadableChunk = {
  authTag: Buffer;
  chunkIndex: number;
  iv: Buffer;
  r2Key: string;
};

type DownloadableFile = {
  chunks: DownloadableChunk[];
  encryptedFek: Buffer;
  mimeType: string;
  name: string;
  size: number;
  totalChunks: number;
};

type PreparedChunkStream = {
  stream: ReadableStream<Uint8Array>;
};

export class FileDownloadServiceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FileDownloadServiceError";
    this.status = status;
  }
}

export async function streamOwnedFile(options: {
  disposition: DownloadDisposition;
  fileId: string;
  signal?: AbortSignal;
  user: CurrentUser;
}): Promise<Response> {
  const file = await findDownloadableFile(options.user.id, options.fileId);

  if (!file) {
    throw new FileDownloadServiceError("File not found", 404);
  }

  if (options.disposition === "inline" && !canPreviewMime(file.mimeType)) {
    throw new FileDownloadServiceError("Preview is not supported for this file type", 415);
  }

  validateChunkMetadata(file.chunks, file.totalChunks);

  const fek = decryptFEK(file.encryptedFek, options.user.uek);
  const body = createDecryptedFileStream(file.chunks, fek, options.signal);

  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": buildContentDisposition(file.name, options.disposition),
      "Content-Length": String(file.size),
      "Content-Type": file.mimeType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}

async function findDownloadableFile(
  userId: string,
  fileId: string,
): Promise<DownloadableFile | null> {
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

function validateChunkMetadata(chunks: DownloadableChunk[], totalChunks: number) {
  if (chunks.length === 0 || totalChunks <= 0) {
    throw new FileDownloadServiceError("File chunks are missing", 500);
  }

  if (chunks.length !== totalChunks) {
    throw new FileDownloadServiceError("File chunk metadata is incomplete", 500);
  }

  for (const [index, chunk] of chunks.entries()) {
    if (chunk.chunkIndex !== index) {
      throw new FileDownloadServiceError("File chunk metadata is inconsistent", 500);
    }
  }
}

function createDecryptedFileStream(
  chunks: DownloadableChunk[],
  fek: Buffer,
  requestSignal?: AbortSignal,
) {
  const abortController = new AbortController();
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let nextChunkPromise: Promise<PreparedChunkStream> | null = null;
  let nextChunkIndex = 0;

  if (requestSignal) {
    if (requestSignal.aborted) {
      abortController.abort(requestSignal.reason);
    } else {
      requestSignal.addEventListener(
        "abort",
        () => {
          abortController.abort(requestSignal.reason);
        },
        { once: true },
      );
    }
  }

  nextChunkPromise = openDecryptedChunk(chunks[0], fek, abortController.signal);

  const releaseActiveChunk = () => {
    activeReader?.releaseLock();
    activeReader = null;
  };

  const advanceToNextChunk = async () => {
    releaseActiveChunk();

    if (!nextChunkPromise) {
      return false;
    }

    const activeChunk = await nextChunkPromise;
    activeReader = activeChunk.stream.getReader();
    nextChunkIndex += 1;
    nextChunkPromise =
      nextChunkIndex < chunks.length
        ? openDecryptedChunk(chunks[nextChunkIndex], fek, abortController.signal)
        : null;

    return true;
  };

  const cleanup = async (reason?: unknown) => {
    abortController.abort(reason);

    if (activeReader) {
      try {
        await activeReader.cancel(reason);
      } catch {
        // Ignore cleanup failures during abort/cancel.
      }
    }

    releaseActiveChunk();

    if (nextChunkPromise) {
      try {
        const pendingChunk = await nextChunkPromise;
        await pendingChunk.stream.cancel(reason);
      } catch {
        // Ignore cleanup failures during abort/cancel.
      }
    }
  };

  return new ReadableStream<Uint8Array>({
    async cancel(reason) {
      await cleanup(reason);
    },
    async pull(controller) {
      try {
        while (true) {
          if (abortController.signal.aborted) {
            throw abortController.signal.reason ?? new DOMException("Aborted", "AbortError");
          }

          if (!activeReader) {
            const hasChunk = await advanceToNextChunk();

            if (!hasChunk) {
              controller.close();
              return;
            }
          }

          const reader = activeReader;

          if (!reader) {
            continue;
          }

          const { done, value } = await reader.read();

          if (done) {
            releaseActiveChunk();
            continue;
          }

          if (value && value.byteLength > 0) {
            controller.enqueue(value);
          }

          return;
        }
      } catch (error) {
        await cleanup(error);

        if (isAbortError(error)) {
          controller.close();
          return;
        }

        console.error("File stream failed", error);
        controller.error(new Error("Failed to stream file"));
      }
    },
  });
}

async function openDecryptedChunk(
  chunk: DownloadableChunk,
  fek: Buffer,
  signal: AbortSignal,
): Promise<PreparedChunkStream> {
  const encryptedStream = await getObjectStream(chunk.r2Key, signal);

  return {
    stream: encryptedStream.pipeThrough(createDecryptStream(fek, chunk.iv, chunk.authTag)),
  };
}

function buildContentDisposition(name: string, disposition: DownloadDisposition) {
  const sanitizedName = sanitizeFilename(name);
  const asciiName = sanitizedName.replace(/[^\x20-\x7E]/g, "_") || "file";
  const encodedName = encodeURIComponent(sanitizedName);

  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}
