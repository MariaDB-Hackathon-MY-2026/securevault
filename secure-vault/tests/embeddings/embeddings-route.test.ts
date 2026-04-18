import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSemanticConfig: vi.fn(),
  startJob: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/ai/config", () => ({
  getSemanticConfig: mocks.getSemanticConfig,
}));

vi.mock("@/lib/ai/embeddings/embedding-job-service", () => {
  class EmbeddingJobConflictError extends Error {
    status = 409;

    constructor(message: string) {
      super(message);
      this.name = "EmbeddingJobConflictError";
    }
  }

  class EmbeddingJobNotFoundError extends Error {
    status = 404;

    constructor(message: string) {
      super(message);
      this.name = "EmbeddingJobNotFoundError";
    }
  }

  return {
    EmbeddingJobConflictError,
    EmbeddingJobNotFoundError,
    EmbeddingJobService: class {
      startJob = mocks.startJob;
    },
  };
});

import { POST } from "@/app/api/embeddings/route";
import { EmbeddingJobConflictError } from "@/lib/ai/embeddings/embedding-job-service";

describe("embeddings start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSemanticConfig.mockReturnValue({ enabled: true });
  });

  it("returns 401 for unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/embeddings", {
      body: JSON.stringify({ fileId: "file-1", modality: "pdf" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid request bodies", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });

    const response = await POST(new Request("http://localhost/api/embeddings", {
      body: JSON.stringify({ fileId: "", modality: "text" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(400);
  });

  it("returns 202 with the job payload when indexing is accepted", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.startJob.mockResolvedValueOnce({
      accepted: true,
      attemptCount: 0,
      errorCode: null,
      fileId: "file-1",
      jobId: "job-1",
      modality: "pdf",
      retryable: false,
      status: "queued",
      updatedAt: "2026-04-15T00:00:00.000Z",
    });

    const response = await POST(new Request("http://localhost/api/embeddings", {
      body: JSON.stringify({ fileId: "file-1", modality: "pdf" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      fileId: "file-1",
      jobId: "job-1",
      status: "queued",
    });
    expect(mocks.startJob).toHaveBeenCalledWith({
      action: undefined,
      fileId: "file-1",
      modality: "pdf",
      userId: "user-1",
    });
  });

  it("returns 409 when retry or reindex state transitions are invalid", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.startJob.mockRejectedValueOnce(
      new EmbeddingJobConflictError("Reindex requires an existing embedding job."),
    );

    const response = await POST(new Request("http://localhost/api/embeddings", {
      body: JSON.stringify({ action: "reindex", fileId: "file-1", modality: "pdf" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: "CONFLICT",
    });
  });
});
