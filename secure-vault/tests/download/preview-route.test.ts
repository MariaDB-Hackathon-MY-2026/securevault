import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  streamOwnedFile: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/files/download-service", () => ({
  FileDownloadServiceError: class FileDownloadServiceError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "FileDownloadServiceError";
      this.status = status;
    }
  },
  streamOwnedFile: mocks.streamOwnedFile,
}));

import { GET } from "@/app/api/files/[id]/preview/route";
import { FileDownloadServiceError } from "@/lib/files/download-service";

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

describe("preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.getCurrentUser.mockResolvedValue(createUser());
    mocks.streamOwnedFile.mockResolvedValue(
      new Response("preview-bytes", {
        headers: {
          "Content-Disposition": 'inline; filename="demo.pdf"',
          "Content-Type": "application/pdf",
        },
        status: 200,
      }),
    );
  });

  it("returns the streamed preview response on success", async () => {
    const response = await GET(
      { signal: new AbortController().signal } as never,
      { params: Promise.resolve({ id: "file-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('inline; filename="demo.pdf"');
    await expect(response.text()).resolves.toBe("preview-bytes");
    expect(mocks.streamOwnedFile).toHaveBeenCalledWith({
      disposition: "inline",
      fileId: "file-1",
      signal: expect.any(AbortSignal),
      user: expect.objectContaining({ id: "user-1" }),
    });
  });

  it("maps preview errors to their status codes", async () => {
    mocks.streamOwnedFile.mockRejectedValueOnce(
      new FileDownloadServiceError("Preview is not supported for this file type", 415),
    );

    const response = await GET(
      { signal: new AbortController().signal } as never,
      { params: Promise.resolve({ id: "file-1" }) },
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: "Preview is not supported for this file type",
    });
  });
});
