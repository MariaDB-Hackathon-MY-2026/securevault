import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getStatus: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/ai/embeddings/embedding-job-service", () => {
  class EmbeddingJobNotFoundError extends Error {
    status = 404;

    constructor(message: string) {
      super(message);
      this.name = "EmbeddingJobNotFoundError";
    }
  }

  return {
    EmbeddingJobNotFoundError,
    EmbeddingJobService: class {
      getStatus = mocks.getStatus;
    },
  };
});

import { GET } from "@/app/api/embeddings/[fileId]/route";

describe("embeddings status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/embeddings/file-1"),
      { params: Promise.resolve({ fileId: "file-1" }) },
    );

    expect(response.status).toBe(401);
  });

  it("returns the latest jobs for the owned file", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.getStatus.mockResolvedValueOnce({
      fileId: "file-1",
      jobs: [
        {
          attemptCount: 1,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          jobId: "job-1",
          modality: "pdf",
          retryable: false,
          startedAt: "2026-04-15T00:00:00.000Z",
          status: "processing",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/embeddings/file-1"),
      { params: Promise.resolve({ fileId: "file-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fileId: "file-1",
      jobs: [
        {
          attemptCount: 1,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          jobId: "job-1",
          modality: "pdf",
          retryable: false,
          startedAt: "2026-04-15T00:00:00.000Z",
          status: "processing",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ],
    });
    expect(mocks.getStatus).toHaveBeenCalledWith("user-1", "file-1");
  });
});
