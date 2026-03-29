import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getUploadStatus: vi.fn(),
  validateUploadStatusSearchParams: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/api/upload/status/service", () => ({
  UploadStatusServiceError: class UploadStatusServiceError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "UploadStatusServiceError";
      this.status = status;
    }
  },
  getUploadStatus: mocks.getUploadStatus,
  validateUploadStatusSearchParams: mocks.validateUploadStatusSearchParams,
}));

import { GET } from "@/app/api/upload/status/route";
import { UploadStatusServiceError } from "@/app/api/upload/status/service";

function createUser() {
  return {
    created_at: new Date("2026-03-23T00:00:00.000Z"),
    email: "alice@example.com",
    email_verified: true,
    id: "user-1",
    name: "Alice",
    storage_quota: 1024,
    storage_used: 0,
    uek: Buffer.alloc(32, 1),
  };
}

function createRequest(url = "https://example.com/api/upload/status?uploadId=upload-1") {
  return {
    nextUrl: new URL(url),
  };
}

describe("upload status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.getCurrentUser.mockResolvedValue(createUser());
    mocks.validateUploadStatusSearchParams.mockReturnValue({
      uploadId: "a".repeat(21),
    });
    mocks.getUploadStatus.mockResolvedValue({
      completedChunkIndexes: [0, 1, 3],
      fileId: "file-1",
      status: "uploading",
      totalChunks: 5,
      uploadId: "a".repeat(21),
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await GET(createRequest() as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid credentials",
    });
    expect(mocks.validateUploadStatusSearchParams).not.toHaveBeenCalled();
  });

  it("returns the upload status payload on success", async () => {
    const request = createRequest();
    const response = await GET(request as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      completedChunkIndexes: [0, 1, 3],
      fileId: "file-1",
      status: "uploading",
      totalChunks: 5,
      uploadId: "a".repeat(21),
    });
    expect(mocks.validateUploadStatusSearchParams).toHaveBeenCalledWith(
      request.nextUrl.searchParams,
    );
    expect(mocks.getUploadStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "user-1" }),
      { uploadId: "a".repeat(21) },
    );
  });

  it("maps expected service errors to their status codes", async () => {
    mocks.validateUploadStatusSearchParams.mockImplementationOnce(() => {
      throw new UploadStatusServiceError("uploadId must be a valid upload session id", 400);
    });

    const response = await GET(createRequest("https://example.com/api/upload/status") as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "uploadId must be a valid upload session id",
    });
  });

  it("returns 500 for unexpected errors", async () => {
    mocks.getUploadStatus.mockRejectedValueOnce(new Error("db offline"));

    const response = await GET(createRequest() as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Failed to fetch upload status",
    });
  });
});

