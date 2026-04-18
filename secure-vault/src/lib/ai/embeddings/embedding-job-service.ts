import "server-only";

import { getSemanticConfig } from "@/lib/ai/config";
import { getEmbeddingDispatcher } from "@/lib/ai/embeddings/dispatcher";
import { getSemanticEligibility } from "@/lib/ai/embeddings/eligibility";
import { isRetryableEmbeddingErrorCode } from "@/lib/ai/embeddings/errors";
import { EmbeddingJobRepository } from "@/lib/ai/embeddings/embedding-job-repository";
import type {
  EmbeddingJobRecord,
  EmbeddingModality,
  StartEmbeddingAction,
  StartEmbeddingJobResponse,
} from "@/lib/ai/embeddings/types";

const repository = new EmbeddingJobRepository();

function toStartResponse(job: EmbeddingJobRecord): StartEmbeddingJobResponse {
  return {
    accepted: true,
    attemptCount: job.attemptCount,
    errorCode: job.errorCode,
    fileId: job.fileId,
    jobId: job.id,
    modality: job.modality,
    retryable: job.retryable,
    status: job.status,
    updatedAt: job.updatedAt.toISOString(),
  };
}

export class EmbeddingJobConflictError extends Error {
  status = 409;

  constructor(message: string) {
    super(message);
    this.name = "EmbeddingJobConflictError";
  }
}

export class EmbeddingJobNotFoundError extends Error {
  status = 404;

  constructor(message: string) {
    super(message);
    this.name = "EmbeddingJobNotFoundError";
  }
}

async function maybeDispatch(job: EmbeddingJobRecord) {
  if (job.status !== "queued") {
    return;
  }

  await getEmbeddingDispatcher().dispatch(job);
}

function resolveAction(action: StartEmbeddingAction | undefined) {
  return action ?? "enqueue";
}

function getSkippedErrorMessage(errorCode: "FILE_TOO_LARGE" | "UNSUPPORTED_MIME") {
  return errorCode === "FILE_TOO_LARGE"
    ? "The file is too large for semantic indexing."
    : "The file type is not supported for semantic indexing.";
}

function isJobRetryWindowOpen(updatedAt: Date, retryBackoffMs: number, now: Date) {
  return updatedAt.getTime() + retryBackoffMs <= now.getTime();
}

export class EmbeddingJobService {
  async startJob(input: {
    action?: StartEmbeddingAction;
    fileId: string;
    modality: EmbeddingModality;
    userId: string;
  }): Promise<StartEmbeddingJobResponse> {
    const file = await repository.getOwnedFile(input.userId, input.fileId);
    if (!file) {
      throw new EmbeddingJobNotFoundError("File not found.");
    }

    if (file.fileStatus !== "ready") {
      throw new EmbeddingJobConflictError("Semantic indexing requires the file to be ready.");
    }

    const config = getSemanticConfig();
    const action = resolveAction(input.action);
    const existingJob = await repository.getJobByFileAndModality(file.fileId, input.modality);

    if (action === "enqueue" && existingJob) {
      if (existingJob.status === "queued") {
        await maybeDispatch(existingJob);
      }

      return toStartResponse(existingJob);
    }

    if (!existingJob && action !== "enqueue") {
      throw new EmbeddingJobConflictError(
        action === "retry"
          ? "Only existing retryable failed jobs can be retried."
          : "Reindex requires an existing embedding job.",
      );
    }

    const eligibility = getSemanticEligibility({
      mimeType: file.mimeType,
      modality: input.modality,
      size: file.size,
    });

    if (!config.enabled || !eligibility.eligible) {
      const errorCode = !config.enabled
        ? "SEMANTIC_INDEXING_DISABLED"
        : !eligibility.eligible
          ? eligibility.errorCode
          : "UNSUPPORTED_MIME";
      const errorMessage = !config.enabled
        ? "Semantic indexing is disabled."
        : !eligibility.eligible
           ? getSkippedErrorMessage(eligibility.errorCode)
           : "The file type is not supported for semantic indexing.";
      const job = existingJob
        ? existingJob.status === "queued" || existingJob.status === "processing" || existingJob.status === "ready"
          ? existingJob
          : await repository.updateJobState({
            completedAt: new Date(),
            errorCode,
            errorMessage,
            jobId: existingJob.id,
            previousStatuses: ["failed", "skipped"],
            status: "skipped",
          })
        : await repository.createJob({
          embeddingDimensions: config.embeddingDimensions,
          embeddingModel: config.geminiEmbeddingModel,
          errorCode,
          errorMessage,
          fileId: file.fileId,
          fileSize: file.size,
          mimeType: file.mimeType,
          modality: input.modality,
          status: "skipped",
          triggeredBy: input.userId,
        });

      return toStartResponse(job);
    }

    if (!existingJob) {
      const job = await repository.createJob({
        embeddingDimensions: config.embeddingDimensions,
        embeddingModel: config.geminiEmbeddingModel,
        errorCode: null,
        errorMessage: null,
        fileId: file.fileId,
        fileSize: file.size,
        mimeType: file.mimeType,
        modality: input.modality,
        status: "queued",
        triggeredBy: input.userId,
      });
      await maybeDispatch(job);
      return toStartResponse(job);
    }

    if (action === "retry") {
      if (existingJob.status !== "failed" || !isRetryableEmbeddingErrorCode(existingJob.errorCode)) {
        throw new EmbeddingJobConflictError(
          "Only retryable failed jobs can be retried. Use reindex after fixing terminal failures.",
        );
      }

      const queuedJob = await repository.resetJobForQueue(existingJob.id);
      await maybeDispatch(queuedJob);
      return toStartResponse(queuedJob);
    }

    if (existingJob.status === "queued" || existingJob.status === "processing") {
      throw new EmbeddingJobConflictError("Cannot reindex a job that is already queued or processing.");
    }

    const queuedJob = await repository.resetJobForQueue(existingJob.id);
    await maybeDispatch(queuedJob);
    return toStartResponse(queuedJob);
  }

  async getStatus(userId: string, fileId: string) {
    const file = await repository.getOwnedFile(userId, fileId);
    if (!file) {
      throw new EmbeddingJobNotFoundError("File not found.");
    }

    const jobs = await repository.listJobsForOwnedFile(userId, fileId);

    return {
      fileId,
      jobs: jobs.map((job) => ({
        attemptCount: job.attemptCount,
        completedAt: job.completedAt?.toISOString() ?? null,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        jobId: job.id,
        modality: job.modality,
        retryable: job.retryable,
        startedAt: job.startedAt?.toISOString() ?? null,
        status: job.status,
        updatedAt: job.updatedAt.toISOString(),
      })),
    };
  }

  async requeueRetryCandidates(limit: number) {
    const config = getSemanticConfig();
    const now = new Date();
    const candidates = await repository.findRetryCandidates({
      limit,
      maxAttempts: config.maxRetryAttempts,
      notUpdatedAfter: new Date(now.getTime() - config.retryBackoffMs),
    });
    let requeued = 0;
    let dispatchFailures = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const file = await repository.getFileForProcessing(candidate.fileId);
      if (
        !file
        || file.deletedAt
        || file.fileStatus !== "ready"
        || candidate.attemptCount >= config.maxRetryAttempts
        || !isJobRetryWindowOpen(candidate.updatedAt, config.retryBackoffMs, now)
      ) {
        skipped += 1;
        continue;
      }

      try {
        const queuedJob = await repository.resetJobForQueue(candidate.id);
        await maybeDispatch(queuedJob);
        requeued += 1;
      } catch (error) {
        dispatchFailures += 1;
        await repository.updateJobState({
          completedAt: new Date(),
          errorCode: candidate.errorCode,
          errorMessage: error instanceof Error ? error.message : candidate.errorMessage,
          jobId: candidate.id,
          status: "failed",
        });
      }
    }

    return {
      dispatchFailures,
      requeued,
      scanned: candidates.length,
      skipped: Math.max(candidates.length - requeued - dispatchFailures, skipped),
    };
  }
}
