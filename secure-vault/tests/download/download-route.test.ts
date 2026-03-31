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

import { GET } from "@/app/api/files/[id]/download/route";
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

describe("download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.getCurrentUser.mockResolvedValue(createUser());
    mocks.streamOwnedFile.mockResolvedValue(
      new Response("file-bytes", {
        headers: {
          "Content-Disposition": 'attachment; filename="demo.pdf"',
          "Content-Type": "application/pdf",
        },
        status: 200,
      }),
    );
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await GET(
      { signal: new AbortController().signal } as never,
      { params: Promise.resolve({ id: "file-1" }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid credentials",
    });
    expect(mocks.streamOwnedFile).not.toHaveBeenCalled();
  });

  it("returns the streamed response on success", async () => {
    const signal = new AbortController().signal;
    const response = await GET(
      { signal } as never,
      { params: Promise.resolve({ id: "file-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="demo.pdf"');
    await expect(response.text()).resolves.toBe("file-bytes");
    expect(mocks.streamOwnedFile).toHaveBeenCalledWith({
      disposition: "attachment",
      fileId: "file-1",
      signal,
      user: expect.objectContaining({ id: "user-1" }),
    });
  });

  it("maps expected service errors to their status codes", async () => {
    mocks.streamOwnedFile.mockRejectedValueOnce(
      new FileDownloadServiceError("File not found", 404),
    );

    const response = await GET(
      { signal: new AbortController().signal } as never,
      { params: Promise.resolve({ id: "missing-file" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "File not found",
    });
  });
});
