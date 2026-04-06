import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertDownloadAllowed: vi.fn(),
  assertShareLinkAccessible: vi.fn(),
  createRateLimitResponse: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordShareAccess: vi.fn(),
  requireFolderShareTargetFile: vi.fn(),
  requireShareLinkByToken: vi.fn(),
  requireSharedFolderContents: vi.fn(),
  requireValidShareAccessSession: vi.fn(),
  streamSharedFile: vi.fn(),
}));

vi.mock("@/lib/sharing/share-access-session", () => ({
  requireValidShareAccessSession: mocks.requireValidShareAccessSession,
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");

  return {
    ...actual,
    createRateLimitResponse: mocks.createRateLimitResponse,
    enforceRateLimit: mocks.enforceRateLimit,
  };
});

vi.mock("@/app/api/files/[id]/service", () => ({
  FileDownloadServiceError: class FileDownloadServiceError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  streamSharedFile: mocks.streamSharedFile,
}));

vi.mock("@/lib/sharing/share-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sharing/share-service")>(
    "@/lib/sharing/share-service",
  );

  return {
    ...actual,
    assertDownloadAllowed: mocks.assertDownloadAllowed,
    assertShareLinkAccessible: mocks.assertShareLinkAccessible,
    recordShareAccess: mocks.recordShareAccess,
    requireFolderShareTargetFile: mocks.requireFolderShareTargetFile,
    requireShareLinkByToken: mocks.requireShareLinkByToken,
    requireSharedFolderContents: mocks.requireSharedFolderContents,
  };
});

import { GET as getDownload } from "@/app/api/share/[token]/download/route";
import { GET as getFolder } from "@/app/api/share/[token]/folder/route";
import { GET as getPreview } from "@/app/api/share/[token]/preview/route";

function createLink(overrides: Partial<{
  allowedEmails: string[];
  created_by: string;
  id: string;
  is_public: boolean;
  targetId: string;
  targetType: "file" | "folder";
}> = {}) {
  return {
    allowedEmails: [],
    created_by: "owner-1",
    id: "link-1",
    is_public: true,
    targetId: "file-1",
    targetType: "file" as const,
    ...overrides,
  };
}

describe("share routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ success: true });
    mocks.requireShareLinkByToken.mockResolvedValue(createLink());
    mocks.streamSharedFile.mockResolvedValue(new Response("shared-bytes", { status: 200 }));
    mocks.requireSharedFolderContents.mockResolvedValue({
      breadcrumb: [{ id: "folder-root", name: "Root" }],
      currentFolder: { id: "folder-root", name: "Root" },
      files: [],
      folders: [],
    });
    mocks.createRateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ error: "Too many download requests" }), {
        headers: { "Retry-After": "60" },
        status: 429,
      }),
    );
  });

  it("downloads a public file share without a verified session", async () => {
    const response = await getDownload(
      new Request("https://example.com/api/share/share-token/download") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.streamSharedFile).toHaveBeenCalledWith({
      disposition: "attachment",
      fileId: "file-1",
      ownerId: "owner-1",
      signal: expect.any(AbortSignal),
    });
    expect(mocks.assertDownloadAllowed).toHaveBeenCalledWith("link-1");
  });

  it("requires a verified session for restricted downloads", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue(
      createLink({
        allowedEmails: ["reader@example.com"],
        is_public: false,
      }),
    );
    mocks.requireValidShareAccessSession.mockResolvedValue(null);

    const response = await getDownload(
      new Request("https://example.com/api/share/share-token/download") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Access denied" });
  });

  it("resolves folder-share downloads through subtree validation", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue(
      createLink({ targetId: "folder-root", targetType: "folder" }),
    );
    mocks.requireFolderShareTargetFile.mockResolvedValue("file-in-folder");

    const response = await getDownload(
      new Request("https://example.com/api/share/share-token/download?fileId=file-in-folder") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireFolderShareTargetFile).toHaveBeenCalledWith({
      fileId: "file-in-folder",
      ownerId: "owner-1",
      rootFolderId: "folder-root",
    });
  });

  it("uses inline disposition for previews", async () => {
    const response = await getPreview(
      new Request("https://example.com/api/share/share-token/preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.streamSharedFile).toHaveBeenCalledWith({
      disposition: "inline",
      fileId: "file-1",
      ownerId: "owner-1",
      signal: expect.any(AbortSignal),
    });
  });

  it("returns 429 before streaming a shared download when the route is rate limited", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ success: false });

    const response = await getDownload(
      new Request("https://example.com/api/share/share-token/download") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.streamSharedFile).not.toHaveBeenCalled();
    expect(mocks.recordShareAccess).not.toHaveBeenCalled();
  });

  it("returns 429 before streaming a shared preview when the route is rate limited", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ success: false });

    const response = await getPreview(
      new Request("https://example.com/api/share/share-token/preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.streamSharedFile).not.toHaveBeenCalled();
  });

  it("does not consume a download slot when file streaming fails before a response is ready", async () => {
    mocks.streamSharedFile.mockRejectedValueOnce(new Error("stream setup failed"));

    const response = await getDownload(
      new Request("https://example.com/api/share/share-token/download") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(500);
    expect(mocks.assertDownloadAllowed).not.toHaveBeenCalled();
    expect(mocks.recordShareAccess).not.toHaveBeenCalled();
  });

  it("returns folder contents only for folder shares", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue(
      createLink({ targetId: "folder-root", targetType: "folder" }),
    );

    const response = await getFolder(
      new Request("https://example.com/api/share/share-token/folder?folderId=folder-root") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      breadcrumb: [{ id: "folder-root", name: "Root" }],
      currentFolder: { id: "folder-root", name: "Root" },
      files: [],
      folders: [],
    });
    expect(mocks.requireSharedFolderContents).toHaveBeenCalledWith({
      currentFolderId: "folder-root",
      ownerId: "owner-1",
      rootFolderId: "folder-root",
    });
  });
});
