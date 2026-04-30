import { EventEmitter } from "node:events";

import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());
const mkdtempMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const rmMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const sharpMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  __esModule: true,
  default: {
    spawn: spawnMock,
  },
  spawn: spawnMock,
}));

vi.mock("node:fs/promises", () => ({
  __esModule: true,
  default: {
    mkdtemp: mkdtempMock,
    readFile: readFileMock,
    rm: rmMock,
    writeFile: writeFileMock,
  },
  mkdtemp: mkdtempMock,
  readFile: readFileMock,
  rm: rmMock,
  writeFile: writeFileMock,
}));

vi.mock("sharp", () => ({
  default: sharpMock,
}));

import { getPdfPageCount, renderPdfPageToWebp } from "@/lib/pdf-preview/renderer";
import { PdfPreviewError } from "@/lib/pdf-preview/errors";

function createChildProcess() {
  const emitter = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
  };

  emitter.kill = vi.fn();
  return emitter;
}

function createSharpImage(options?: {
  metadata?: { height?: number; width?: number };
  toBufferResults?: Array<Buffer | Error>;
}) {
  const toBufferQueue = [...(options?.toBufferResults ?? [Buffer.from("webp")])];
  const image = {
    metadata: vi.fn().mockResolvedValue(
      options?.metadata ?? {
        height: 1754,
        width: 1240,
      },
    ),
    rotate: vi.fn(),
    toBuffer: vi.fn(async () => {
      const nextValue = toBufferQueue.shift();

      if (nextValue instanceof Error) {
        throw nextValue;
      }

      return nextValue ?? Buffer.from("webp");
    }),
    webp: vi.fn(),
  };

  image.rotate.mockReturnValue(image);
  image.webp.mockReturnValue(image);

  return image;
}

async function waitForSpawnSetup() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("pdf renderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdtempMock.mockResolvedValue("C:\\temp\\shared-preview");
    readFileMock.mockResolvedValue(Buffer.from("png-bytes"));
    rmMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
  });

  it("reads the page count from a valid pdf", async () => {
    const document = await PDFDocument.create();
    document.addPage([300, 400]);
    document.addPage([400, 500]);
    const bytes = await document.save();

    await expect(getPdfPageCount({ bytes: Buffer.from(bytes) })).resolves.toBe(2);
  });

  it("maps corrupt pdf input to a parse failure", async () => {
    await expect(getPdfPageCount({ bytes: Buffer.from("not-a-pdf") })).rejects.toThrowError(
      new PdfPreviewError(
        "PDF_PARSE_FAILED",
        "PDF cannot be rendered for secure preview",
      ),
    );
  });

  it("renders a page to webp successfully", async () => {
    const child = createChildProcess();
    const metadataImage = createSharpImage({ toBufferResults: [Buffer.from("webp-output")] });
    const renderImage = createSharpImage({ toBufferResults: [Buffer.from("webp-output")] });
    spawnMock.mockReturnValue(child);
    sharpMock
      .mockReturnValueOnce(metadataImage)
      .mockReturnValueOnce(renderImage);

    const renderPromise = renderPdfPageToWebp({
      bytes: Buffer.from("%PDF"),
      dpi: 144,
      maxOutputBytes: 1024,
      pageNumber: 1,
    });

    await waitForSpawnSetup();
    child.emit("exit", 0);
    const result = await renderPromise;

    expect(result).toEqual({
      bytes: Buffer.from("webp-output"),
      height: 1754,
      mimeType: "image/webp",
      width: 1240,
    });
    expect(rmMock).toHaveBeenCalledWith("C:\\temp\\shared-preview", {
      force: true,
      recursive: true,
    });
  });

  it("rejects invalid page numbers before spawning", async () => {
    await expect(
      renderPdfPageToWebp({
        bytes: Buffer.from("%PDF"),
        dpi: 144,
        maxOutputBytes: 1024,
        pageNumber: 0,
      }),
    ).rejects.toThrowError(new PdfPreviewError("INVALID_PAGE", "Page must be a positive integer"));

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("maps non-zero poppler exit codes to render failures", async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);
    sharpMock.mockReturnValue(createSharpImage());

    const renderPromise = renderPdfPageToWebp({
      bytes: Buffer.from("%PDF"),
      dpi: 144,
      maxOutputBytes: 1024,
      pageNumber: 1,
    });

    await waitForSpawnSetup();
    child.emit("exit", 1);

    await expect(renderPromise).rejects.toThrowError(
      new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered"),
    );
    expect(rmMock).toHaveBeenCalled();
  });

  it("maps a missing output file to a render failure", async () => {
    const child = createChildProcess();
    spawnMock.mockReturnValue(child);
    readFileMock.mockRejectedValue(new Error("ENOENT"));

    const renderPromise = renderPdfPageToWebp({
      bytes: Buffer.from("%PDF"),
      dpi: 144,
      maxOutputBytes: 1024,
      pageNumber: 1,
    });

    await waitForSpawnSetup();
    child.emit("exit", 0);

    await expect(renderPromise).rejects.toThrowError(
      new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered"),
    );
    expect(rmMock).toHaveBeenCalled();
  });

  it("maps sharp conversion failures to render failures", async () => {
    const child = createChildProcess();
    const metadataImage = createSharpImage();
    const renderImage = createSharpImage({
      toBufferResults: [new Error("sharp failed")],
    });
    spawnMock.mockReturnValue(child);
    sharpMock
      .mockReturnValueOnce(metadataImage)
      .mockReturnValueOnce(renderImage);

    const renderPromise = renderPdfPageToWebp({
      bytes: Buffer.from("%PDF"),
      dpi: 144,
      maxOutputBytes: 1024,
      pageNumber: 1,
    });

    await waitForSpawnSetup();
    child.emit("exit", 0);

    await expect(renderPromise).rejects.toThrowError(
      new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered"),
    );
    expect(rmMock).toHaveBeenCalled();
  });

  it("kills the child process when the request aborts", async () => {
    const child = createChildProcess();
    const abortController = new AbortController();
    spawnMock.mockReturnValue(child);
    sharpMock.mockReturnValue(createSharpImage());

    const renderPromise = renderPdfPageToWebp({
      bytes: Buffer.from("%PDF"),
      dpi: 144,
      maxOutputBytes: 1024,
      pageNumber: 1,
      signal: abortController.signal,
    });

    abortController.abort(new DOMException("Aborted", "AbortError"));

    await expect(renderPromise).rejects.toThrow("Aborted");
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(rmMock).toHaveBeenCalled();
  });

  it("retries once when the first webp output exceeds the configured limit", async () => {
    const child = createChildProcess();
    const metadataImage = createSharpImage();
    const firstRenderImage = createSharpImage({
      toBufferResults: [Buffer.alloc(1500, 1)],
    });
    const retryRenderImage = createSharpImage({
      toBufferResults: [Buffer.alloc(900, 2)],
    });
    spawnMock.mockReturnValue(child);
    sharpMock
      .mockReturnValueOnce(metadataImage)
      .mockReturnValueOnce(firstRenderImage)
      .mockReturnValueOnce(retryRenderImage);

    const renderPromise = renderPdfPageToWebp({
      bytes: Buffer.from("%PDF"),
      dpi: 144,
      maxOutputBytes: 1024,
      pageNumber: 1,
    });

    await waitForSpawnSetup();
    child.emit("exit", 0);
    const result = await renderPromise;

    expect(result.bytes).toEqual(Buffer.alloc(900, 2));
    expect(sharpMock).toHaveBeenCalledTimes(3);
  });

  it("fails after the retry when the output still exceeds the configured limit", async () => {
    const child = createChildProcess();
    const metadataImage = createSharpImage();
    const firstRenderImage = createSharpImage({
      toBufferResults: [Buffer.alloc(1500, 1)],
    });
    const retryRenderImage = createSharpImage({
      toBufferResults: [Buffer.alloc(1300, 2)],
    });
    spawnMock.mockReturnValue(child);
    sharpMock
      .mockReturnValueOnce(metadataImage)
      .mockReturnValueOnce(firstRenderImage)
      .mockReturnValueOnce(retryRenderImage);

    const renderPromise = renderPdfPageToWebp({
      bytes: Buffer.from("%PDF"),
      dpi: 144,
      maxOutputBytes: 1024,
      pageNumber: 1,
    });

    await waitForSpawnSetup();
    child.emit("exit", 0);

    await expect(renderPromise).rejects.toThrowError(
      new PdfPreviewError(
        "PDF_RENDER_FAILED",
        "Rendered PDF page exceeds the secure preview output limit",
      ),
    );
    expect(rmMock).toHaveBeenCalled();
  });
});
