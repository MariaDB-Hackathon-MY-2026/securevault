import "server-only";

import { nanoid } from "nanoid";

import { getSemanticConfig } from "@/lib/ai/config";
import { decryptUEK } from "@/lib/crypto";
import { readOwnedFileBytes } from "@/lib/files/file-bytes";
import { EmbeddingError, type EmbeddingErrorCode } from "@/lib/ai/embeddings/errors";
import { splitPdfForEmbedding } from "@/lib/ai/embeddings/pdf-splitter";
import { embedBinaryForRetrieval } from "@/lib/ai/embeddings/embedder";
import { EmbeddingJobRepository } from "@/lib/ai/embeddings/embedding-job-repository";
import { persistEmbeddings } from "@/lib/ai/embeddings/persist-embeddings";
import { serializeVector } from "@/lib/ai/embeddings/vector";
import type { EmbeddingChunkPayload } from "@/lib/ai/embeddings/types";

const repository = new EmbeddingJobRepository();
const MAX_PERSISTED_ERROR_MESSAGE_LENGTH = 1024;

function getDocumentContextLabel(pageFrom: number | null, pageTo: number | null) {
  const pageContext =
    pageFrom && pageTo
      ? `pages ${pageFrom}-${pageTo}`
      : "file";

  return `document section: ${pageContext} | text: none`;
}

function truncateErrorMessage(message: string) {
  if (message.length <= MAX_PERSISTED_ERROR_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_PERSISTED_ERROR_MESSAGE_LENGTH - 1).trimEnd()}…`;
}

function getSqlMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeSqlError = error as { cause?: unknown; sqlMessage?: string };
  if (typeof maybeSqlError.sqlMessage === "string" && maybeSqlError.sqlMessage.trim().length > 0) {
    return maybeSqlError.sqlMessage.trim();
  }

  return getSqlMessage(maybeSqlError.cause);
}

function getPersistableErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return truncateErrorMessage(getSqlMessage(error) ?? error.message);
  }

  return "Semantic indexing failed.";
}

function normalizeProcessingError(error: unknown): EmbeddingError {
  if (error instanceof EmbeddingError) {
    return error;
  }

  return new EmbeddingError(
    "EMBEDDING_PROVIDER_FAILED",
    getPersistableErrorMessage(error),
    { cause: error },
  );
}

function buildImageChunks(mimeType: string, bytes: Buffer): EmbeddingChunkPayload[] {
  return [
    {
      bytes,
      chunkIndex: 0,
      chunkType: "full",
      contextLabel: getDocumentContextLabel(null, null),
      mimeType,
      pageFrom: null,
      pageTo: null,
    },
  ];
}

export async function processEmbeddingJob(input: { jobId: string }) {
  const job = await repository.getJobById(input.jobId);
  if (!job) {
    return { processed: false, reason: "missing-job" } as const;
  }

  const now = new Date();
  const processorId = nanoid();
  const config = getSemanticConfig();
  const claimedJob = await repository.claimJob({
    jobId: input.jobId,
    leaseExpiresAt: new Date(now.getTime() + config.leaseDurationMs),
    now,
    processorId,
  });

  if (!claimedJob) {
    return { processed: false, reason: "already-claimed" } as const;
  }

  try {
    const file = await repository.getFileForProcessing(claimedJob.fileId);
    if (!file) {
      throw new EmbeddingError("FILE_DELETED", "The file no longer exists for semantic indexing.", {
        retryable: false,
      });
    }

    if (file.deletedAt) {
      throw new EmbeddingError("FILE_DELETED", "The file was deleted before semantic indexing completed.", {
        retryable: false,
      });
    }

    if (file.fileStatus !== "ready") {
      throw new EmbeddingError("FILE_NOT_READY", "The file is not ready for semantic indexing.", {
        retryable: false,
      });
    }

    let uek: Buffer;
    try {
      uek = decryptUEK(file.encryptedUek);
    } catch (error) {
      throw new EmbeddingError("DECRYPT_FAILED", "Failed to decrypt the user encryption key.", {
        cause: error,
        retryable: false,
      });
    }

    const ownedBytes = await readOwnedFileBytes({
      fileId: file.fileId,
      uek,
      userId: file.userId,
    });

    if (!ownedBytes) {
      throw new EmbeddingError("FILE_DELETED", "The file could not be loaded for semantic indexing.", {
        retryable: false,
      });
    }

    const chunks = claimedJob.modality === "pdf"
      ? (await splitPdfForEmbedding({
        bytes: ownedBytes.bytes,
        fileName: file.name,
        mimeType: file.mimeType,
      })).map((chunk) => ({
        ...chunk,
        contextLabel: getDocumentContextLabel(chunk.pageFrom, chunk.pageTo),
      }))
      : buildImageChunks(file.mimeType, ownedBytes.bytes);
    const serializedChunks: Array<{
      chunkIndex: number;
      chunkType: "full" | "page" | "window";
      embedding: string;
      pageFrom: number | null;
      pageTo: number | null;
    }> = [];

    for (const chunk of chunks) {
      const heartbeatNow = new Date();
      const heartbeatOk = await repository.heartbeatJob({
        jobId: claimedJob.id,
        leaseExpiresAt: new Date(heartbeatNow.getTime() + config.leaseDurationMs),
        now: heartbeatNow,
        processorId,
      });

      if (!heartbeatOk) {
        throw new EmbeddingError("JOB_LEASE_EXPIRED", "The job lease expired while semantic indexing was running.");
      }

      const embedding = await embedBinaryForRetrieval({
        bytes: chunk.bytes,
        contextText: chunk.contextLabel,
        mimeType: chunk.mimeType,
      });

      serializedChunks.push({
        chunkIndex: chunk.chunkIndex,
        chunkType: chunk.chunkType,
        embedding: serializeVector(embedding),
        pageFrom: chunk.pageFrom,
        pageTo: chunk.pageTo,
      });
    }

    const finalized = await persistEmbeddings({
      chunks: serializedChunks,
      fileId: claimedJob.fileId,
      jobId: claimedJob.id,
      modality: claimedJob.modality,
      now: new Date(),
      processorId,
    });

    if (!finalized) {
      throw new EmbeddingError("JOB_LEASE_EXPIRED", "The processor lost the job lease before finalizing semantic indexing.");
    }

    return { processed: true, reason: "ready" } as const;
  } catch (error) {
    const normalizedError = normalizeProcessingError(error);
    const failed = await repository.failJob({
      completedAt: new Date(),
      errorCode: normalizedError.code,
      errorMessage: normalizedError.message,
      jobId: claimedJob.id,
      processorId,
    });

    if (!failed) {
      await repository.markJobLeaseExpired({
        jobId: claimedJob.id,
        message: normalizedError.message,
        now: new Date(),
      });
    }

    return {
      code: normalizedError.code as EmbeddingErrorCode,
      processed: false,
      reason: "failed",
    } as const;
  }
}
