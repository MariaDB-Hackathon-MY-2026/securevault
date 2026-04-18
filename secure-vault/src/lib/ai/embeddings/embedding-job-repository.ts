import "server-only";

import { and, asc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { MariadbConnection } from "@/lib/db";
import { embeddingChunks, embeddingJobs, files, folders, users } from "@/lib/db/schema";
import { isRetryableEmbeddingErrorCode, type EmbeddingErrorCode } from "@/lib/ai/embeddings/errors";
import type {
  EmbeddingJobRecord,
  EmbeddingJobStatus,
  EmbeddingModality,
} from "@/lib/ai/embeddings/types";

type FileEmbeddingRecord = {
  deletedAt: Date | null;
  encryptedUek: Buffer;
  fileId: string;
  fileStatus: "failed" | "ready" | "uploading";
  folderId: string | null;
  mimeType: string;
  name: string;
  size: number;
  updatedAt: Date;
  userId: string;
};

type FinalizeChunkInput = {
  chunkIndex: number;
  chunkType: "full" | "page" | "window";
  embedding: string;
  pageFrom: number | null;
  pageTo: number | null;
};

const MAX_EMBEDDING_ERROR_MESSAGE_LENGTH = 1024;

function getAffectedCount(result: unknown) {
  if (Array.isArray(result)) {
    return getAffectedCount(result[0]);
  }

  if (!result || typeof result !== "object") {
    return 0;
  }

  const maybe = result as { affectedRows?: number; rowsAffected?: number };
  return maybe.rowsAffected ?? maybe.affectedRows ?? 0;
}

function toPersistedErrorMessage(message: string | null) {
  if (!message) {
    return message;
  }

  if (message.length <= MAX_EMBEDDING_ERROR_MESSAGE_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_EMBEDDING_ERROR_MESSAGE_LENGTH - 1).trimEnd()}…`;
}

function mapJobRow(row: {
  attemptCount: number;
  completedAt: Date | null;
  embeddingDimensions: number;
  embeddingModel: string;
  errorCode: EmbeddingErrorCode | null;
  errorMessage: string | null;
  fileId: string;
  fileSize: number;
  id: string;
  lastHeartbeatAt: Date | null;
  leaseExpiresAt: Date | null;
  mimeType: string;
  modality: EmbeddingModality;
  processorId: string | null;
  startedAt: Date | null;
  status: EmbeddingJobStatus;
  triggeredBy: string | null;
  updatedAt: Date;
}): EmbeddingJobRecord {
  return {
    attemptCount: row.attemptCount,
    completedAt: row.completedAt,
    embeddingDimensions: row.embeddingDimensions,
    embeddingModel: row.embeddingModel,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    fileId: row.fileId,
    fileSize: row.fileSize,
    id: row.id,
    lastHeartbeatAt: row.lastHeartbeatAt,
    leaseExpiresAt: row.leaseExpiresAt,
    mimeType: row.mimeType,
    modality: row.modality,
    processorId: row.processorId,
    retryable: isRetryableEmbeddingErrorCode(row.errorCode),
    startedAt: row.startedAt,
    status: row.status,
    triggeredBy: row.triggeredBy,
    updatedAt: row.updatedAt,
  };
}

function mapUnknownJobRow(row: {
  attemptCount: number;
  completedAt: Date | null;
  embeddingDimensions: number;
  embeddingModel: string;
  errorCode: string | null;
  errorMessage: string | null;
  fileId: string;
  fileSize: number;
  id: string;
  lastHeartbeatAt: Date | null;
  leaseExpiresAt: Date | null;
  mimeType: string;
  modality: EmbeddingModality;
  processorId: string | null;
  startedAt: Date | null;
  status: EmbeddingJobStatus;
  triggeredBy: string | null;
  updatedAt: Date;
}) {
  return mapJobRow({
    ...row,
    errorCode: row.errorCode as EmbeddingErrorCode | null,
  });
}

function baseJobSelect() {
  return {
    attemptCount: embeddingJobs.attempt_count,
    completedAt: embeddingJobs.completed_at,
    embeddingDimensions: embeddingJobs.embedding_dimensions,
    embeddingModel: embeddingJobs.embedding_model,
    errorCode: embeddingJobs.error_code,
    errorMessage: embeddingJobs.error_message,
    fileId: embeddingJobs.file_id,
    fileSize: embeddingJobs.file_size,
    id: embeddingJobs.id,
    lastHeartbeatAt: embeddingJobs.last_heartbeat_at,
    leaseExpiresAt: embeddingJobs.lease_expires_at,
    mimeType: embeddingJobs.mime_type,
    modality: embeddingJobs.modality,
    processorId: embeddingJobs.processor_id,
    startedAt: embeddingJobs.started_at,
    status: embeddingJobs.status,
    triggeredBy: embeddingJobs.triggered_by,
    updatedAt: embeddingJobs.updated_at,
  };
}

export class EmbeddingJobRepository {
  async getOwnedFile(userId: string, fileId: string): Promise<FileEmbeddingRecord | null> {
    const db = MariadbConnection.getConnection();
    const [row] = await db
      .select({
        deletedAt: files.deleted_at,
        encryptedUek: users.encrypted_uek,
        fileId: files.id,
        fileStatus: files.status,
        folderId: files.folder_id,
        mimeType: files.mime_type,
        name: files.name,
        size: files.size,
        updatedAt: files.updated_at,
        userId: files.user_id,
      })
      .from(files)
      .innerJoin(users, eq(users.id, files.user_id))
      .where(and(eq(files.id, fileId), eq(files.user_id, userId), isNull(files.deleted_at)))
      .limit(1);

    return row ?? null;
  }

  async getFileForProcessing(fileId: string): Promise<FileEmbeddingRecord | null> {
    const db = MariadbConnection.getConnection();
    const [row] = await db
      .select({
        deletedAt: files.deleted_at,
        encryptedUek: users.encrypted_uek,
        fileId: files.id,
        fileStatus: files.status,
        folderId: files.folder_id,
        mimeType: files.mime_type,
        name: files.name,
        size: files.size,
        updatedAt: files.updated_at,
        userId: files.user_id,
      })
      .from(files)
      .innerJoin(users, eq(users.id, files.user_id))
      .where(eq(files.id, fileId))
      .limit(1);

    return row ?? null;
  }

  async getJobByFileAndModality(fileId: string, modality: EmbeddingModality) {
    const db = MariadbConnection.getConnection();
    const [row] = await db
      .select(baseJobSelect())
      .from(embeddingJobs)
      .where(and(eq(embeddingJobs.file_id, fileId), eq(embeddingJobs.modality, modality)))
      .limit(1);

    return row ? mapUnknownJobRow(row) : null;
  }

  async getJobById(jobId: string) {
    const db = MariadbConnection.getConnection();
    const [row] = await db
      .select(baseJobSelect())
      .from(embeddingJobs)
      .where(eq(embeddingJobs.id, jobId))
      .limit(1);

    return row ? mapUnknownJobRow(row) : null;
  }

  async listJobsForOwnedFile(userId: string, fileId: string) {
    const db = MariadbConnection.getConnection();
    const rows = await db
      .select(baseJobSelect())
      .from(embeddingJobs)
      .innerJoin(files, eq(files.id, embeddingJobs.file_id))
      .where(and(eq(files.user_id, userId), eq(files.id, fileId)))
      .orderBy(asc(embeddingJobs.modality));

    return rows.map(mapUnknownJobRow);
  }

  async createJob(input: {
    embeddingDimensions: number;
    embeddingModel: string;
    errorCode: EmbeddingErrorCode | null;
    errorMessage: string | null;
    fileId: string;
    fileSize: number;
    mimeType: string;
    modality: EmbeddingModality;
    status: EmbeddingJobStatus;
    triggeredBy: string | null;
  }) {
    const db = MariadbConnection.getConnection();
    const id = nanoid();
    const now = new Date();

    await db.insert(embeddingJobs).values({
      attempt_count: 0,
      completed_at: input.status === "queued" ? null : now,
      created_at: now,
      embedding_dimensions: input.embeddingDimensions,
      embedding_model: input.embeddingModel,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      file_id: input.fileId,
      file_size: input.fileSize,
      id,
      mime_type: input.mimeType,
      modality: input.modality,
      started_at: null,
      status: input.status,
      triggered_by: input.triggeredBy,
      updated_at: now,
    });

    const job = await this.getJobById(id);
    if (!job) {
      throw new Error("Failed to create embedding job.");
    }

    return job;
  }

  async updateJobState(input: {
    completedAt: Date | null;
    errorCode: EmbeddingErrorCode | null;
    errorMessage: string | null;
    jobId: string;
    previousStatuses?: EmbeddingJobStatus[];
    status: EmbeddingJobStatus;
  }) {
    const db = MariadbConnection.getConnection();
    const filters = [eq(embeddingJobs.id, input.jobId)];
    if (input.previousStatuses && input.previousStatuses.length > 0) {
      filters.push(inArray(embeddingJobs.status, input.previousStatuses));
    }

    await db
      .update(embeddingJobs)
      .set({
        completed_at: input.completedAt,
        error_code: input.errorCode,
        error_message: toPersistedErrorMessage(input.errorMessage),
        last_heartbeat_at: null,
        lease_expires_at: null,
        processor_id: null,
        status: input.status,
        updated_at: new Date(),
      })
      .where(and(...filters));

    const job = await this.getJobById(input.jobId);
    if (!job) {
      throw new Error("Embedding job not found after update.");
    }

    return job;
  }

  async resetJobForQueue(jobId: string) {
    const db = MariadbConnection.getConnection();
    await db
      .update(embeddingJobs)
      .set({
        completed_at: null,
        error_code: null,
        error_message: null,
        last_heartbeat_at: null,
        lease_expires_at: null,
        processor_id: null,
        started_at: null,
        status: "queued",
        updated_at: new Date(),
      })
      .where(eq(embeddingJobs.id, jobId));

    const job = await this.getJobById(jobId);
    if (!job) {
      throw new Error("Embedding job not found after queue reset.");
    }

    return job;
  }

  async claimJob(input: {
    jobId: string;
    leaseExpiresAt: Date;
    now: Date;
    processorId: string;
  }) {
    const db = MariadbConnection.getConnection();
    const result = await db
      .update(embeddingJobs)
      .set({
        attempt_count: sql`${embeddingJobs.attempt_count} + 1`,
        completed_at: null,
        error_code: null,
        error_message: null,
        last_heartbeat_at: input.now,
        lease_expires_at: input.leaseExpiresAt,
        processor_id: input.processorId,
        started_at: input.now,
        status: "processing",
        updated_at: input.now,
      })
      .where(
        and(
          eq(embeddingJobs.id, input.jobId),
          sql`(
            ${embeddingJobs.status} = 'queued'
            or (${embeddingJobs.status} = 'processing' and ${embeddingJobs.lease_expires_at} is not null and ${embeddingJobs.lease_expires_at} < ${input.now})
          )`,
        ),
      );

    if (getAffectedCount(result) === 0) {
      return null;
    }

    return this.getJobById(input.jobId);
  }

  async heartbeatJob(input: {
    jobId: string;
    leaseExpiresAt: Date;
    now: Date;
    processorId: string;
  }) {
    const db = MariadbConnection.getConnection();
    const result = await db
      .update(embeddingJobs)
      .set({
        last_heartbeat_at: input.now,
        lease_expires_at: input.leaseExpiresAt,
        updated_at: input.now,
      })
      .where(
        and(
          eq(embeddingJobs.id, input.jobId),
          eq(embeddingJobs.status, "processing"),
          eq(embeddingJobs.processor_id, input.processorId),
        ),
      );

    return getAffectedCount(result) > 0;
  }

  async failJob(input: {
    completedAt: Date;
    errorCode: EmbeddingErrorCode;
    errorMessage: string;
    jobId: string;
    processorId: string;
  }) {
    const db = MariadbConnection.getConnection();
    const result = await db
      .update(embeddingJobs)
      .set({
        completed_at: input.completedAt,
        error_code: input.errorCode,
        error_message: toPersistedErrorMessage(input.errorMessage),
        last_heartbeat_at: null,
        lease_expires_at: null,
        processor_id: null,
        status: "failed",
        updated_at: input.completedAt,
      })
      .where(
        and(
          eq(embeddingJobs.id, input.jobId),
          eq(embeddingJobs.status, "processing"),
          eq(embeddingJobs.processor_id, input.processorId),
        ),
      );

    return getAffectedCount(result) > 0;
  }

  async markJobLeaseExpired(input: {
    jobId: string;
    message: string;
    now: Date;
  }) {
    const db = MariadbConnection.getConnection();
    const result = await db
      .update(embeddingJobs)
      .set({
        completed_at: input.now,
        error_code: "JOB_LEASE_EXPIRED",
        error_message: toPersistedErrorMessage(input.message),
        last_heartbeat_at: null,
        lease_expires_at: null,
        processor_id: null,
        status: "failed",
        updated_at: input.now,
      })
      .where(
        and(
          eq(embeddingJobs.id, input.jobId),
          eq(embeddingJobs.status, "processing"),
          sql`${embeddingJobs.lease_expires_at} is not null and ${embeddingJobs.lease_expires_at} < ${input.now}`,
        ),
      );

    return getAffectedCount(result) > 0;
  }

  async finalizeJobReady(input: {
    chunks: FinalizeChunkInput[];
    fileId: string;
    jobId: string;
    modality: EmbeddingModality;
    now: Date;
    processorId: string;
  }) {
    const db = MariadbConnection.getConnection();

    return db.transaction(async (tx) => {
      const [jobRow] = await tx
        .select({
          processorId: embeddingJobs.processor_id,
          status: embeddingJobs.status,
        })
        .from(embeddingJobs)
        .where(eq(embeddingJobs.id, input.jobId))
        .limit(1);

      if (!jobRow || jobRow.status !== "processing" || jobRow.processorId !== input.processorId) {
        return false;
      }

      await tx.delete(embeddingChunks).where(eq(embeddingChunks.job_id, input.jobId));

      if (input.chunks.length > 0) {
        await tx.insert(embeddingChunks).values(
          input.chunks.map((chunk) => ({
            chunk_index: chunk.chunkIndex,
            chunk_type: chunk.chunkType,
            embedding: sql`VEC_FromText(${chunk.embedding})`,
            file_id: input.fileId,
            id: nanoid(),
            job_id: input.jobId,
            modality: input.modality,
            page_from: chunk.pageFrom,
            page_to: chunk.pageTo,
          })),
        );
      }

      await tx
        .update(embeddingJobs)
        .set({
          completed_at: input.now,
          error_code: null,
          error_message: null,
          last_heartbeat_at: null,
          lease_expires_at: null,
          processor_id: null,
          status: "ready",
          updated_at: input.now,
        })
        .where(eq(embeddingJobs.id, input.jobId));

      return true;
    });
  }

  async findRetryCandidates(input: {
    limit: number;
    maxAttempts: number;
    notUpdatedAfter: Date;
  }) {
    const db = MariadbConnection.getConnection();
    const rows = await db
      .select(baseJobSelect())
      .from(embeddingJobs)
      .innerJoin(files, eq(files.id, embeddingJobs.file_id))
      .where(
        and(
          eq(embeddingJobs.status, "failed"),
          eq(files.status, "ready"),
          isNull(files.deleted_at),
          lt(embeddingJobs.attempt_count, input.maxAttempts),
          lte(embeddingJobs.updated_at, input.notUpdatedAfter),
          inArray(embeddingJobs.error_code, [
            "EMBEDDING_PROVIDER_FAILED",
            "EMBEDDING_PROVIDER_TIMEOUT",
            "R2_READ_FAILED",
            "JOB_LEASE_EXPIRED",
          ]),
        ),
      )
      .orderBy(asc(embeddingJobs.updated_at), asc(embeddingJobs.id))
      .limit(input.limit);

    return rows.map(mapUnknownJobRow);
  }

  async listFolderRows(userId: string) {
    const db = MariadbConnection.getConnection();
    return db
      .select({
        id: folders.id,
        name: folders.name,
        parentId: folders.parent_id,
      })
      .from(folders)
      .where(and(eq(folders.user_id, userId), isNull(folders.deleted_at)));
  }
}
