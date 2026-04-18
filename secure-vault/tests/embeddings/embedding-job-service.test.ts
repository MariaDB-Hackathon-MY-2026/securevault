import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  getSemanticConfig: vi.fn(),
  getSemanticEligibility: vi.fn(),
  repository: {
    createJob: vi.fn(),
    findRetryCandidates: vi.fn(),
    getFileForProcessing: vi.fn(),
    getJobByFileAndModality: vi.fn(),
    getOwnedFile: vi.fn(),
    listJobsForOwnedFile: vi.fn(),
    resetJobForQueue: vi.fn(),
    updateJobState: vi.fn(),
  },
}));

vi.mock("@/lib/ai/config", () => ({
  getSemanticConfig: mocks.getSemanticConfig,
}));

vi.mock("@/lib/ai/embeddings/dispatcher", () => ({
  getEmbeddingDispatcher: () => ({
    dispatch: mocks.dispatch,
  }),
}));

vi.mock("@/lib/ai/embeddings/eligibility", () => ({
  getSemanticEligibility: mocks.getSemanticEligibility,
}));

vi.mock("@/lib/ai/embeddings/embedding-job-repository", () => ({
  EmbeddingJobRepository: class {
    createJob = mocks.repository.createJob;
    findRetryCandidates = mocks.repository.findRetryCandidates;
    getFileForProcessing = mocks.repository.getFileForProcessing;
    getJobByFileAndModality = mocks.repository.getJobByFileAndModality;
    getOwnedFile = mocks.repository.getOwnedFile;
    listJobsForOwnedFile = mocks.repository.listJobsForOwnedFile;
    resetJobForQueue = mocks.repository.resetJobForQueue;
    updateJobState = mocks.repository.updateJobState;
  },
}));

import {
  EmbeddingJobConflictError,
  EmbeddingJobService,
} from "@/lib/ai/embeddings/embedding-job-service";

function makeFile(overrides?: Partial<{
  fileId: string;
  fileStatus: "failed" | "ready" | "uploading";
  mimeType: string;
  size: number;
  userId: string;
}>) {
  return {
    deletedAt: null,
    encryptedUek: Buffer.alloc(32),
    fileId: "file-1",
    fileStatus: "ready" as const,
    folderId: null,
    mimeType: "application/pdf",
    name: "report.pdf",
    size: 1024,
    updatedAt: new Date("2026-04-15T00:00:00.000Z"),
    userId: "user-1",
    ...overrides,
  };
}

function makeJob(overrides?: Partial<{
  attemptCount: number;
  errorCode: "EMBEDDING_PROVIDER_FAILED" | "JOB_LEASE_EXPIRED" | "FILE_NOT_READY" | null;
  errorMessage: string | null;
  id: string;
  retryable: boolean;
  status: "failed" | "processing" | "queued" | "ready" | "skipped";
  updatedAt: Date;
}>) {
  return {
    attemptCount: 0,
    completedAt: null,
    embeddingDimensions: 1536,
    embeddingModel: "gemini-embedding-2-preview",
    errorCode: null,
    errorMessage: null,
    fileId: "file-1",
    fileSize: 1024,
    id: "job-1",
    lastHeartbeatAt: null,
    leaseExpiresAt: null,
    mimeType: "application/pdf",
    modality: "pdf" as const,
    processorId: null,
    retryable: false,
    startedAt: null,
    status: "queued" as const,
    triggeredBy: "user-1",
    updatedAt: new Date("2026-04-15T00:00:00.000Z"),
    ...overrides,
  };
}

describe("EmbeddingJobService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSemanticConfig.mockReturnValue({
      embeddingDimensions: 1536,
      enabled: true,
      geminiEmbeddingModel: "gemini-embedding-2-preview",
      maxRetryAttempts: 3,
      retryBackoffMs: 1000,
    });
    mocks.getSemanticEligibility.mockReturnValue({
      eligible: true,
    });
    mocks.repository.getOwnedFile.mockResolvedValue(makeFile());
    mocks.repository.getJobByFileAndModality.mockResolvedValue(null);
    mocks.repository.createJob.mockResolvedValue(makeJob());
    mocks.repository.findRetryCandidates.mockResolvedValue([]);
  });

  it("rejects indexing for files that are not ready", async () => {
    const service = new EmbeddingJobService();
    mocks.repository.getOwnedFile.mockResolvedValueOnce(makeFile({ fileStatus: "uploading" }));

    await expect(service.startJob({
      fileId: "file-1",
      modality: "pdf",
      userId: "user-1",
    })).rejects.toBeInstanceOf(EmbeddingJobConflictError);
  });

  it("returns an existing processing job unchanged when indexing becomes ineligible", async () => {
    const service = new EmbeddingJobService();
    const processingJob = makeJob({
      status: "processing",
      updatedAt: new Date("2026-04-15T00:00:00.000Z"),
    });
    mocks.repository.getJobByFileAndModality.mockResolvedValueOnce(processingJob);
    mocks.getSemanticEligibility.mockReturnValueOnce({
      eligible: false,
      errorCode: "UNSUPPORTED_MIME",
    });

    const result = await service.startJob({
      fileId: "file-1",
      modality: "pdf",
      userId: "user-1",
    });

    expect(result.status).toBe("processing");
    expect(mocks.repository.updateJobState).not.toHaveBeenCalled();
  });

  it("rejects retry when no logical job exists yet", async () => {
    const service = new EmbeddingJobService();

    await expect(service.startJob({
      action: "retry",
      fileId: "file-1",
      modality: "pdf",
      userId: "user-1",
    })).rejects.toBeInstanceOf(EmbeddingJobConflictError);

    expect(mocks.repository.createJob).not.toHaveBeenCalled();
  });

  it("rejects reindex when no logical job exists yet", async () => {
    const service = new EmbeddingJobService();

    await expect(service.startJob({
      action: "reindex",
      fileId: "file-1",
      modality: "pdf",
      userId: "user-1",
    })).rejects.toBeInstanceOf(EmbeddingJobConflictError);

    expect(mocks.repository.createJob).not.toHaveBeenCalled();
  });

  it("skips retry candidates that exceeded attempts, are within backoff, or reference non-ready files", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));

    const service = new EmbeddingJobService();
    mocks.repository.findRetryCandidates.mockResolvedValueOnce([
      makeJob({
        attemptCount: 3,
        errorCode: "EMBEDDING_PROVIDER_FAILED",
        retryable: true,
        status: "failed",
        updatedAt: new Date("2026-04-15T11:55:00.000Z"),
      }),
      makeJob({
        attemptCount: 1,
        errorCode: "JOB_LEASE_EXPIRED",
        id: "job-2",
        retryable: true,
        status: "failed",
        updatedAt: new Date("2026-04-15T11:59:59.500Z"),
      }),
      makeJob({
        attemptCount: 1,
        errorCode: "EMBEDDING_PROVIDER_FAILED",
        id: "job-3",
        retryable: true,
        status: "failed",
        updatedAt: new Date("2026-04-15T11:58:00.000Z"),
      }),
    ]);
    mocks.repository.getFileForProcessing
      .mockResolvedValueOnce(makeFile())
      .mockResolvedValueOnce(makeFile())
      .mockResolvedValueOnce(makeFile({ fileStatus: "failed" }));

    const result = await service.requeueRetryCandidates(25);

    expect(result).toEqual({
      dispatchFailures: 0,
      requeued: 0,
      scanned: 3,
      skipped: 3,
    });
    expect(mocks.repository.resetJobForQueue).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("requeues eligible retry candidates through the dispatcher", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));

    const service = new EmbeddingJobService();
    const failedJob = makeJob({
      attemptCount: 1,
      errorCode: "EMBEDDING_PROVIDER_FAILED",
      retryable: true,
      status: "failed",
      updatedAt: new Date("2026-04-15T11:58:00.000Z"),
    });
    const queuedJob = makeJob({
      attemptCount: 1,
      errorCode: null,
      retryable: false,
      status: "queued",
      updatedAt: new Date("2026-04-15T12:00:00.000Z"),
    });
    mocks.repository.findRetryCandidates.mockResolvedValueOnce([failedJob]);
    mocks.repository.getFileForProcessing.mockResolvedValueOnce(makeFile());
    mocks.repository.resetJobForQueue.mockResolvedValueOnce(queuedJob);

    const result = await service.requeueRetryCandidates(25);

    expect(result).toEqual({
      dispatchFailures: 0,
      requeued: 1,
      scanned: 1,
      skipped: 0,
    });
    expect(mocks.repository.resetJobForQueue).toHaveBeenCalledWith("job-1");
    expect(mocks.dispatch).toHaveBeenCalledWith(queuedJob);

    vi.useRealTimers();
  });
});
