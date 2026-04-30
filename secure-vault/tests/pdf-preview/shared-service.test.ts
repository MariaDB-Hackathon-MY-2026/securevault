import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertPdfRendererAvailable: vi.fn(),
  buildPdfPreviewR2Key: vi.fn(),
  deleteObject: vi.fn(),
  getObjectStream: vi.fn(),
  getPdfPageCount: vi.fn(),
  getPreviewPage: vi.fn(),
  getSharedPdfPreviewConfig: vi.fn(),
  insertReadyPreviewPage: vi.fn(),
  listPreviewPages: vi.fn(),
  putObject: vi.fn(),
  readSharedFileBytes: vi.fn(),
  renderPdfPageToWebp: vi.fn(),
}));

vi.mock("@/lib/pdf-preview/config", () => ({
  getSharedPdfPreviewConfig: mocks.getSharedPdfPreviewConfig,
}));

vi.mock("@/lib/pdf-preview/renderer-probe", () => ({
  assertPdfRendererAvailable: mocks.assertPdfRendererAvailable,
}));

vi.mock("@/lib/files/file-bytes", () => ({
  readSharedFileBytes: mocks.readSharedFileBytes,
}));

vi.mock("@/lib/pdf-preview/renderer", () => ({
  getPdfPageCount: mocks.getPdfPageCount,
  renderPdfPageToWebp: mocks.renderPdfPageToWebp,
}));

vi.mock("@/lib/pdf-preview/repository", () => ({
  getPreviewPage: mocks.getPreviewPage,
  insertReadyPreviewPage: mocks.insertReadyPreviewPage,
  isDuplicatePreviewPageInsertError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY"),
  listPreviewPages: mocks.listPreviewPages,
}));

vi.mock("@/lib/storage/r2", () => ({
  buildPdfPreviewR2Key: mocks.buildPdfPreviewR2Key,
  deleteObject: mocks.deleteObject,
  getObjectStream: mocks.getObjectStream,
  putObject: mocks.putObject,
}));

import { createEncryptStream, encryptFEK } from "@/lib/crypto";
import {
  getSharedPdfPreviewManifest,
  getSharedPdfPreviewPage,
} from "@/lib/pdf-preview/shared-service";

function createStream(chunks: Array<Uint8Array | Buffer>) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
      }

      controller.close();
    },
  });
}

async function collectStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

async function encryptBytes(bytes: Buffer, key: Buffer) {
  const encryptor = createEncryptStream(key);
  const encrypted = await collectStream(createStream([bytes]).pipeThrough(encryptor.stream));

  return {
    authTag: encryptor.getAuthTag(),
    encrypted,
    iv: encryptor.getIV(),
  };
}

describe("shared pdf preview service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPdfRendererAvailable.mockResolvedValue(undefined);
    mocks.buildPdfPreviewR2Key.mockReturnValue("user-1/previews/pdf/file-1/v1/page_1.webp");
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.getPdfPageCount.mockResolvedValue(3);
    mocks.getPreviewPage.mockResolvedValue(null);
    mocks.getSharedPdfPreviewConfig.mockReturnValue({
      dpi: 144,
      enabled: true,
      maxBytes: 25 * 1024 * 1024,
      maxPageImageBytes: 1024,
      maxPages: 100,
      renderVersion: 1,
    });
    mocks.insertReadyPreviewPage.mockResolvedValue(undefined);
    mocks.listPreviewPages.mockResolvedValue([]);
    mocks.putObject.mockResolvedValue(undefined);
    mocks.readSharedFileBytes.mockResolvedValue({
      bytes: Buffer.from("%PDF-1.4"),
      file: {
        encryptedFek: encryptFEK(Buffer.alloc(32, 9), Buffer.alloc(32, 7)),
        mimeType: "application/pdf",
        name: "report.pdf",
        size: 1024,
        totalChunks: 1,
      },
      ownerUek: Buffer.alloc(32, 7),
    });
    mocks.renderPdfPageToWebp.mockResolvedValue({
      bytes: Buffer.from("rendered-webp"),
      height: 1754,
      mimeType: "image/webp",
      width: 1240,
    });
  });

  it("returns a manifest with ready and pending pages", async () => {
    mocks.listPreviewPages.mockResolvedValue([
      {
        auth_tag: Buffer.alloc(16),
        created_at: new Date(),
        error_message: null,
        file_id: "file-1",
        height: 1754,
        id: "preview-1",
        iv: Buffer.alloc(12),
        mime_type: "image/webp",
        page_number: 1,
        r2_key: "preview-key",
        render_version: 1,
        size: 900,
        status: "ready",
        updated_at: new Date(),
        width: 1240,
      },
    ]);

    await expect(
      getSharedPdfPreviewManifest({
        fileId: "file-1",
        ownerId: "owner-1",
        pageBaseUrl: "/api/share/token/pdf-preview/pages",
      }),
    ).resolves.toEqual({
      fileId: "file-1",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      pageCount: 3,
      pages: [
        {
          height: 1754,
          page: 1,
          src: "/api/share/token/pdf-preview/pages/1",
          status: "ready",
          width: 1240,
        },
        {
          height: null,
          page: 2,
          src: "/api/share/token/pdf-preview/pages/2",
          status: "pending",
          width: null,
        },
        {
          height: null,
          page: 3,
          src: "/api/share/token/pdf-preview/pages/3",
          status: "pending",
          width: null,
        },
      ],
      renderVersion: 1,
    });
  });

  it("returns a cached page image when preview metadata already exists", async () => {
    const fileFek = Buffer.alloc(32, 9);
    const cachedImage = await encryptBytes(Buffer.from("cached-webp"), fileFek);
    mocks.readSharedFileBytes.mockResolvedValue({
      bytes: Buffer.from("%PDF-1.4"),
      file: {
        encryptedFek: encryptFEK(fileFek, Buffer.alloc(32, 7)),
        mimeType: "application/pdf",
        name: "report.pdf",
        size: 1024,
        totalChunks: 1,
      },
      ownerUek: Buffer.alloc(32, 7),
    });
    mocks.getPreviewPage.mockResolvedValue({
      auth_tag: cachedImage.authTag,
      created_at: new Date(),
      error_message: null,
      file_id: "file-1",
      height: 1754,
      id: "preview-1",
      iv: cachedImage.iv,
      mime_type: "image/webp",
      page_number: 1,
      r2_key: "preview-key",
      render_version: 1,
      size: 900,
      status: "ready",
      updated_at: new Date(),
      width: 1240,
    });
    mocks.getObjectStream.mockResolvedValue(createStream([cachedImage.encrypted]));

    const response = await getSharedPdfPreviewPage({
      fileId: "file-1",
      ownerId: "owner-1",
      pageNumber: 1,
    });

    expect(response.headers.get("Content-Type")).toBe("image/webp");
    await expect(response.arrayBuffer()).resolves.toEqual(
      Buffer.from("cached-webp").buffer.slice(
        Buffer.from("cached-webp").byteOffset,
        Buffer.from("cached-webp").byteOffset + Buffer.from("cached-webp").byteLength,
      ),
    );
    expect(mocks.renderPdfPageToWebp).not.toHaveBeenCalled();
  });

  it("renders, encrypts, and caches a page when no preview exists yet", async () => {
    const response = await getSharedPdfPreviewPage({
      fileId: "file-1",
      ownerId: "owner-1",
      pageNumber: 1,
    });

    expect(await response.text()).toBe("rendered-webp");
    expect(mocks.putObject).toHaveBeenCalledWith(
      "user-1/previews/pdf/file-1/v1/page_1.webp",
      expect.any(Buffer),
      "application/octet-stream",
    );
    expect(mocks.insertReadyPreviewPage).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file-1",
        pageNumber: 1,
        r2Key: "user-1/previews/pdf/file-1/v1/page_1.webp",
      }),
    );
  });

  it("rejects non-pdf files", async () => {
    mocks.readSharedFileBytes.mockResolvedValue({
      bytes: Buffer.from("png"),
      file: {
        encryptedFek: encryptFEK(Buffer.alloc(32, 9), Buffer.alloc(32, 7)),
        mimeType: "image/png",
        name: "report.png",
        size: 1024,
        totalChunks: 1,
      },
      ownerUek: Buffer.alloc(32, 7),
    });

    await expect(
      getSharedPdfPreviewManifest({
        fileId: "file-1",
        ownerId: "owner-1",
        pageBaseUrl: "/api/share/token/pdf-preview/pages",
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_MIME",
      status: 415,
    });
  });

  it("rejects files larger than the secure preview limit", async () => {
    mocks.readSharedFileBytes.mockResolvedValue({
      bytes: Buffer.from("%PDF"),
      file: {
        encryptedFek: encryptFEK(Buffer.alloc(32, 9), Buffer.alloc(32, 7)),
        mimeType: "application/pdf",
        name: "report.pdf",
        size: 99_999_999,
        totalChunks: 1,
      },
      ownerUek: Buffer.alloc(32, 7),
    });

    await expect(
      getSharedPdfPreviewManifest({
        fileId: "file-1",
        ownerId: "owner-1",
        pageBaseUrl: "/api/share/token/pdf-preview/pages",
      }),
    ).rejects.toMatchObject({
      code: "PDF_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects files with too many pages", async () => {
    mocks.getPdfPageCount.mockResolvedValue(101);

    await expect(
      getSharedPdfPreviewManifest({
        fileId: "file-1",
        ownerId: "owner-1",
        pageBaseUrl: "/api/share/token/pdf-preview/pages",
      }),
    ).rejects.toMatchObject({
      code: "PDF_TOO_MANY_PAGES",
      status: 413,
    });
  });

  it("rejects out-of-range page requests", async () => {
    mocks.getPdfPageCount.mockResolvedValue(2);

    await expect(
      getSharedPdfPreviewPage({
        fileId: "file-1",
        ownerId: "owner-1",
        pageNumber: 3,
      }),
    ).rejects.toMatchObject({
      code: "PAGE_NOT_FOUND",
      status: 404,
    });
  });
});
