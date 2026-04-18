import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decryptUEK: vi.fn(),
  embedBinaryForRetrieval: vi.fn(),
  getSemanticConfig: vi.fn(),
  persistEmbeddings: vi.fn(),
  readOwnedFileBytes: vi.fn(),
  repository: {
    claimJob: vi.fn(),
    failJob: vi.fn(),
    getFileForProcessing: vi.fn(),
    getJobById: vi.fn(),
    heartbeatJob: vi.fn(),
    markJobLeaseExpired: vi.fn(),
  },
  splitPdfForEmbedding: vi.fn(),
}));

vi.mock("@/lib/ai/config", () => ({
  getSemanticConfig: mocks.getSemanticConfig,
}));

vi.mock("@/lib/crypto", () => ({
  decryptUEK: mocks.decryptUEK,
}));

vi.mock("@/lib/files/file-bytes", () => ({
  readOwnedFileBytes: mocks.readOwnedFileBytes,
}));

vi.mock("@/lib/ai/embeddings/embedder", () => ({
  embedBinaryForRetrieval: mocks.embedBinaryForRetrieval,
}));

vi.mock("@/lib/ai/embeddings/persist-embeddings", () => ({
  persistEmbeddings: mocks.persistEmbeddings,
}));

vi.mock("@/lib/ai/embeddings/pdf-splitter", () => ({
  splitPdfForEmbedding: mocks.splitPdfForEmbedding,
}));

vi.mock("@/lib/ai/embeddings/embedding-job-repository", () => ({
  EmbeddingJobRepository: class {
    claimJob = mocks.repository.claimJob;
    failJob = mocks.repository.failJob;
    getFileForProcessing = mocks.repository.getFileForProcessing;
    getJobById = mocks.repository.getJobById;
    heartbeatJob = mocks.repository.heartbeatJob;
    markJobLeaseExpired = mocks.repository.markJobLeaseExpired;
  },
}));

import { processEmbeddingJob } from "@/lib/ai/embeddings/embedding-processor";

describe("processEmbeddingJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSemanticConfig.mockReturnValue({
      leaseDurationMs: 60_000,
    });
    mocks.repository.getJobById.mockResolvedValue({
      fileId: "file-1",
      id: "job-1",
      modality: "pdf",
    });
    mocks.repository.claimJob.mockResolvedValue({
      fileId: "file-1",
      id: "job-1",
      modality: "pdf",
    });
    mocks.repository.getFileForProcessing.mockResolvedValue({
      deletedAt: null,
      encryptedUek: Buffer.alloc(32),
      fileId: "file-1",
      fileStatus: "ready",
      mimeType: "application/pdf",
      name: "report.pdf",
      userId: "user-1",
    });
    mocks.repository.failJob.mockResolvedValue(true);
  });

  it("classifies UEK decryption failures as DECRYPT_FAILED", async () => {
    mocks.decryptUEK.mockImplementationOnce(() => {
      throw new Error("bad master key");
    });

    const result = await processEmbeddingJob({ jobId: "job-1" });

    expect(result).toEqual({
      code: "DECRYPT_FAILED",
      processed: false,
      reason: "failed",
    });
    expect(mocks.repository.failJob).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "DECRYPT_FAILED",
    }));
  });

  it("persists a concise SQL error message instead of the full failed query dump", async () => {
    mocks.decryptUEK.mockReturnValue(Buffer.alloc(32));
    mocks.readOwnedFileBytes.mockResolvedValue({
      bytes: Buffer.from("image-bytes"),
    });
    mocks.repository.getJobById.mockResolvedValue({
      fileId: "file-1",
      id: "job-1",
      modality: "image",
    });
    mocks.repository.claimJob.mockResolvedValue({
      fileId: "file-1",
      id: "job-1",
      modality: "image",
    });
    mocks.repository.heartbeatJob.mockResolvedValue(true);
    mocks.embedBinaryForRetrieval.mockResolvedValue(new Array<number>(1536).fill(1 / Math.sqrt(1536)));
    mocks.persistEmbeddings.mockRejectedValue(
      Object.assign(new Error("Failed query: insert into embedding_chunks (...)"), {
        cause: {
          sqlMessage: "Data too long for column 'embedding' at row 1",
        },
      }),
    );

    const result = await processEmbeddingJob({ jobId: "job-1" });

    expect(result).toEqual({
      code: "EMBEDDING_PROVIDER_FAILED",
      processed: false,
      reason: "failed",
    });
    expect(mocks.repository.failJob).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "EMBEDDING_PROVIDER_FAILED",
      errorMessage: "Data too long for column 'embedding' at row 1",
    }));
  });

  it("does not include the file name in image embedding context", async () => {
    mocks.decryptUEK.mockReturnValue(Buffer.alloc(32));
    mocks.readOwnedFileBytes.mockResolvedValue({
      bytes: Buffer.from("image-bytes"),
    });
    mocks.repository.getJobById.mockResolvedValue({
      fileId: "file-1",
      id: "job-1",
      modality: "image",
    });
    mocks.repository.claimJob.mockResolvedValue({
      fileId: "file-1",
      id: "job-1",
      modality: "image",
    });
    mocks.repository.heartbeatJob.mockResolvedValue(true);
    mocks.embedBinaryForRetrieval.mockResolvedValue(new Array<number>(1536).fill(1 / Math.sqrt(1536)));
    mocks.persistEmbeddings.mockResolvedValue(true);

    const result = await processEmbeddingJob({ jobId: "job-1" });

    expect(result).toEqual({
      processed: true,
      reason: "ready",
    });
    expect(mocks.embedBinaryForRetrieval).toHaveBeenCalledWith(expect.objectContaining({
      contextText: "document section: file | text: none",
    }));
    expect(mocks.embedBinaryForRetrieval).not.toHaveBeenCalledWith(expect.objectContaining({
      contextText: expect.stringContaining("report.pdf"),
    }));
  });

  it("keeps PDF page context without leaking the file name into embeddings", async () => {
    mocks.decryptUEK.mockReturnValue(Buffer.alloc(32));
    mocks.readOwnedFileBytes.mockResolvedValue({
      bytes: Buffer.from("pdf-bytes"),
    });
    mocks.repository.heartbeatJob.mockResolvedValue(true);
    mocks.splitPdfForEmbedding.mockResolvedValue([
      {
        bytes: Buffer.from("page-bytes"),
        chunkIndex: 0,
        chunkType: "page",
        contextLabel: "ignored",
        mimeType: "application/pdf",
        pageFrom: 2,
        pageTo: 2,
      },
    ]);
    mocks.embedBinaryForRetrieval.mockResolvedValue(new Array<number>(1536).fill(1 / Math.sqrt(1536)));
    mocks.persistEmbeddings.mockResolvedValue(true);

    const result = await processEmbeddingJob({ jobId: "job-1" });

    expect(result).toEqual({
      processed: true,
      reason: "ready",
    });
    expect(mocks.embedBinaryForRetrieval).toHaveBeenCalledWith(expect.objectContaining({
      contextText: "document section: pages 2-2 | text: none",
    }));
    expect(mocks.embedBinaryForRetrieval).not.toHaveBeenCalledWith(expect.objectContaining({
      contextText: expect.stringContaining("report.pdf"),
    }));
  });
});
