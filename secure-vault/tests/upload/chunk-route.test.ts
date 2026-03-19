import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  uploadChunk: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/api/upload/chunk/service", () => ({
  UploadChunkServiceError: class UploadChunkServiceError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "UploadChunkServiceError";
      this.status = status;
    }
  },
  uploadChunk: mocks.uploadChunk,
}));

import { POST } from "@/app/api/upload/chunk/route";
import { UploadChunkServiceError } from "@/app/api/upload/chunk/service";

function createUser() {
  return {
    created_at: new Date("2026-03-20T00:00:00.000Z"),
    email: "alice@example.com",
    email_verified: true,
    id: "user-1",
    name: "Alice",
    storage_quota: 1024,
    storage_used: 0,
    uek: Buffer.alloc(32, 1),
  };
}

function createRequest(overrides?: {
  body?: ReadableStream<Uint8Array> | null;
  headers?: Headers;
}) {
  return {
    body: overrides?.body ?? null,
    headers:
      overrides?.headers ??
      new Headers({
        "x-chunk-index": "0",
        "x-upload-id": "upload-1",
      }),
  } as never;
}

describe("upload chunk route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.getCurrentUser.mockResolvedValue(createUser());
    mocks.uploadChunk.mockResolvedValue({
      chunkIndex: 0,
      status: "uploaded",
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid credentials",
    });
    expect(mocks.uploadChunk).not.toHaveBeenCalled();
  });

  it("returns the uploaded chunk payload on success", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const headers = new Headers({
      "x-chunk-index": "2",
      "x-upload-id": "upload-2",
    });

    const response = await POST(createRequest({ body, headers }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      chunkIndex: 0,
      status: "uploaded",
    });
    expect(mocks.uploadChunk).toHaveBeenCalledWith({
      body,
      headers,
      user: expect.objectContaining({ id: "user-1" }),
    });
  });

  it("maps expected service errors to their status codes", async () => {
    mocks.uploadChunk.mockRejectedValueOnce(
      new UploadChunkServiceError("Chunk already uploaded", 409),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Chunk already uploaded",
    });
  });

  it("returns 500 for unexpected errors", async () => {
    mocks.uploadChunk.mockRejectedValueOnce(new Error("r2 offline"));

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Failed to upload chunk",
    });
  });
});
