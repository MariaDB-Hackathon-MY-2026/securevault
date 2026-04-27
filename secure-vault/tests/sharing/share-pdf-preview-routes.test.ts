import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertDownloadAllowed: vi.fn(),
  assertShareLinkAccessible: vi.fn(),
  createRateLimitResponse: vi.fn(),
  enforceRateLimit: vi.fn(),
  getSharedPdfPreviewManifest: vi.fn(),
  getSharedPdfPreviewPage: vi.fn(),
  recordShareAccess: vi.fn(),
  requireFolderShareTargetFile: vi.fn(),
  requireShareLinkByToken: vi.fn(),
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

vi.mock("@/lib/pdf-preview/shared-service", () => ({
  getSharedPdfPreviewManifest: mocks.getSharedPdfPreviewManifest,
  getSharedPdfPreviewPage: mocks.getSharedPdfPreviewPage,
}));

vi.mock("@/app/api/files/[id]/service", () => ({
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
  };
});

import { GET as getPdfPreviewManifest } from "@/app/api/share/[token]/pdf-preview/route";
import { GET as getPdfPreviewPage } from "@/app/api/share/[token]/pdf-preview/pages/[page]/route";
import { PdfPreviewError } from "@/lib/pdf-preview/errors";
import { ShareServiceError } from "@/lib/sharing/share-service";

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

describe("share pdf preview routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertShareLinkAccessible.mockImplementation(() => undefined);
    mocks.createRateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ error: "Too many download requests" }), {
        headers: { "Retry-After": "60" },
        status: 429,
      }),
    );
    mocks.enforceRateLimit.mockResolvedValue({ success: true });
    mocks.getSharedPdfPreviewManifest.mockResolvedValue({
      fileId: "file-1",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      pages: [
        {
          height: 1754,
          page: 1,
          src: "/api/share/share-token/pdf-preview/pages/1",
          status: "ready",
          width: 1240,
        },
      ],
      renderVersion: 1,
    });
    mocks.getSharedPdfPreviewPage.mockResolvedValue(
      new Response(Buffer.from("webp"), {
        headers: { "Content-Type": "image/webp" },
        status: 200,
      }),
    );
    mocks.requireShareLinkByToken.mockResolvedValue(createLink());
  });

  it("returns a manifest for a public direct-file share and records access once", async () => {
    const response = await getPdfPreviewManifest(
      new Request("https://example.com/api/share/share-token/pdf-preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fileId: "file-1",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      pageCount: 1,
      pages: [
        {
          height: 1754,
          page: 1,
          src: "/api/share/share-token/pdf-preview/pages/1",
          status: "ready",
          width: 1240,
        },
      ],
      renderVersion: 1,
    });
    expect(mocks.recordShareAccess).toHaveBeenCalledTimes(1);
    expect(mocks.assertDownloadAllowed).not.toHaveBeenCalled();
    expect(mocks.streamSharedFile).not.toHaveBeenCalled();
  });

  it("returns a page image for a public direct-file share without recording access", async () => {
    const response = await getPdfPreviewPage(
      new Request("https://example.com/api/share/share-token/pdf-preview/pages/1") as never,
      { params: Promise.resolve({ page: "1", token: "share-token" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(mocks.recordShareAccess).not.toHaveBeenCalled();
    expect(mocks.assertDownloadAllowed).not.toHaveBeenCalled();
    expect(mocks.streamSharedFile).not.toHaveBeenCalled();
  });

  it("requires a verified session for restricted shares", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue(
      createLink({
        allowedEmails: ["reader@example.com"],
        is_public: false,
      }),
    );
    mocks.requireValidShareAccessSession.mockResolvedValue(null);

    const manifestResponse = await getPdfPreviewManifest(
      new Request("https://example.com/api/share/share-token/pdf-preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );
    const pageResponse = await getPdfPreviewPage(
      new Request("https://example.com/api/share/share-token/pdf-preview/pages/1") as never,
      { params: Promise.resolve({ page: "1", token: "share-token" }) },
    );

    expect(manifestResponse.status).toBe(403);
    expect(pageResponse.status).toBe(403);
  });

  it("allows restricted shares with a valid session", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue(
      createLink({
        allowedEmails: ["reader@example.com"],
        is_public: false,
      }),
    );
    mocks.requireValidShareAccessSession.mockResolvedValue({
      email: "reader@example.com",
      id: "session-1",
    });

    const manifestResponse = await getPdfPreviewManifest(
      new Request("https://example.com/api/share/share-token/pdf-preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );
    const pageResponse = await getPdfPreviewPage(
      new Request("https://example.com/api/share/share-token/pdf-preview/pages/1") as never,
      { params: Promise.resolve({ page: "1", token: "share-token" }) },
    );

    expect(manifestResponse.status).toBe(200);
    expect(pageResponse.status).toBe(200);
  });

  it("maps revoked shares to 404", async () => {
    mocks.assertShareLinkAccessible.mockImplementation(() => {
      throw new ShareServiceError("NOT_FOUND", "Share link not found", 404);
    });

    const response = await getPdfPreviewManifest(
      new Request("https://example.com/api/share/share-token/pdf-preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(404);
  });

  it("maps expired shares to 410", async () => {
    mocks.assertShareLinkAccessible.mockImplementation(() => {
      throw new ShareServiceError("EXPIRED", "Share link is expired", 410);
    });

    const response = await getPdfPreviewPage(
      new Request("https://example.com/api/share/share-token/pdf-preview/pages/1") as never,
      { params: Promise.resolve({ page: "1", token: "share-token" }) },
    );

    expect(response.status).toBe(410);
  });

  it("validates folder-share file selection and preserves the fileId query in manifest page urls", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue(
      createLink({ targetId: "folder-root", targetType: "folder" }),
    );
    mocks.requireFolderShareTargetFile.mockResolvedValue("nested-file");

    const response = await getPdfPreviewManifest(
      new Request("https://example.com/api/share/share-token/pdf-preview?fileId=nested-file") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pages: [
        expect.objectContaining({
          src: "/api/share/share-token/pdf-preview/pages/1?fileId=nested-file",
        }),
      ],
    });
    expect(mocks.requireFolderShareTargetFile).toHaveBeenCalledWith({
      fileId: "nested-file",
      ownerId: "owner-1",
      rootFolderId: "folder-root",
    });
  });

  it("returns 404 when a folder share omits fileId", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue(
      createLink({ targetId: "folder-root", targetType: "folder" }),
    );
    mocks.requireFolderShareTargetFile.mockRejectedValue(
      new ShareServiceError("NOT_FOUND", "Share link not found", 404),
    );

    const response = await getPdfPreviewManifest(
      new Request("https://example.com/api/share/share-token/pdf-preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(404);
  });

  it("maps unsupported files to 415", async () => {
    mocks.getSharedPdfPreviewManifest.mockRejectedValue(
      new PdfPreviewError(
        "UNSUPPORTED_MIME",
        "PDF image preview is only supported for PDF files",
      ),
    );

    const response = await getPdfPreviewManifest(
      new Request("https://example.com/api/share/share-token/pdf-preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(415);
  });

  it("rejects invalid page strings before the service call", async () => {
    for (const page of ["abc", "1.5", "0"]) {
      const response = await getPdfPreviewPage(
        new Request(`https://example.com/api/share/share-token/pdf-preview/pages/${page}`) as never,
        { params: Promise.resolve({ page, token: "share-token" }) },
      );

      expect(response.status).toBe(400);
    }

    expect(mocks.getSharedPdfPreviewPage).not.toHaveBeenCalled();
  });

  it("returns 429 before the manifest service when rate limited", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ success: false });

    const response = await getPdfPreviewManifest(
      new Request("https://example.com/api/share/share-token/pdf-preview") as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(429);
    expect(mocks.getSharedPdfPreviewManifest).not.toHaveBeenCalled();
  });

  it("returns 429 before the page service when rate limited", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ success: false });

    const response = await getPdfPreviewPage(
      new Request("https://example.com/api/share/share-token/pdf-preview/pages/1") as never,
      { params: Promise.resolve({ page: "1", token: "share-token" }) },
    );

    expect(response.status).toBe(429);
    expect(mocks.getSharedPdfPreviewPage).not.toHaveBeenCalled();
  });
});
