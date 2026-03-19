import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  checkQuotaAndFileSize: vi.fn(),
  initializeUpload: vi.fn(),
  validateInitBody: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/api/upload/init/service", () => ({
  UploadInitServiceError: class UploadInitServiceError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "UploadInitServiceError";
      this.status = status;
    }
  },
  checkQuotaAndFileSize: mocks.checkQuotaAndFileSize,
  initializeUpload: mocks.initializeUpload,
  validateInitBody: mocks.validateInitBody,
}));

import { POST } from "@/app/api/upload/init/route";
import { UploadInitServiceError } from "@/app/api/upload/init/service";

function createRequest(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as never;
}

function createUser() {
  return {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice",
    email_verified: true,
    storage_used: 0,
    storage_quota: 1024,
    created_at: new Date("2026-03-19T00:00:00.000Z"),
    uek: Buffer.alloc(32, 1),
  };
}

describe("upload init route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.getCurrentUser.mockResolvedValue(createUser());
    mocks.validateInitBody.mockImplementation((body: unknown) => body);
    mocks.checkQuotaAndFileSize.mockImplementation(() => undefined);
    mocks.initializeUpload.mockResolvedValue({
      fileId: "file-1",
      uploadId: "upload-1",
      totalChunks: 3,
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await POST(createRequest({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid credentials",
    });
    expect(mocks.validateInitBody).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const request = {
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    } as never;

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid JSON request body",
    });
    expect(mocks.validateInitBody).not.toHaveBeenCalled();
  });

  it("returns the service error status and message for expected failures", async () => {
    mocks.checkQuotaAndFileSize.mockImplementationOnce(() => {
      throw new UploadInitServiceError("File size exceeds upload size limit", 413);
    });

    const response = await POST(
      createRequest({
        fileName: "report.pdf",
        fileSize: 1,
        fileType: "application/pdf",
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: "File size exceeds upload size limit",
    });
    expect(mocks.initializeUpload).not.toHaveBeenCalled();
  });

  it("returns 500 for unexpected errors", async () => {
    mocks.initializeUpload.mockRejectedValueOnce(new Error("db offline"));

    const response = await POST(
      createRequest({
        fileName: "report.pdf",
        fileSize: 1,
        fileType: "application/pdf",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Failed to initialize upload",
    });
  });
});
