import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { getSharedPdfPreviewConfig } from "@/lib/pdf-preview/config";
import { PdfPreviewError } from "@/lib/pdf-preview/errors";

type RenderedWebpImage = {
  bytes: Buffer;
  height: number;
  mimeType: "image/webp";
  width: number;
};

export async function getPdfPageCount(input: { bytes: Buffer }): Promise<number> {
  try {
    const document = await PDFDocument.load(new Uint8Array(input.bytes), {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const pageCount = document.getPageCount();

    if (pageCount <= 0) {
      throw new Error("PDF has no pages");
    }

    return pageCount;
  } catch (error) {
    throw new PdfPreviewError(
      "PDF_PARSE_FAILED",
      "PDF cannot be rendered for secure preview",
      { cause: error },
    );
  }
}

export async function renderPdfPageToWebp(input: {
  bytes: Buffer;
  dpi: number;
  maxOutputBytes: number;
  pageNumber: number;
  signal?: AbortSignal;
}): Promise<RenderedWebpImage> {
  if (!Number.isInteger(input.pageNumber) || input.pageNumber <= 0) {
    throw new PdfPreviewError("INVALID_PAGE", "Page must be a positive integer");
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "securevault-shared-pdf-preview-"));
  const sourcePdfPath = path.join(tempDir, "source.pdf");
  const pageBasePath = path.join(tempDir, "page");
  const pagePngPath = path.join(tempDir, "page.png");

  try {
    await writeFile(sourcePdfPath, input.bytes);
    await runPdftocairo({
      dpi: input.dpi,
      outputBasePath: pageBasePath,
      pageNumber: input.pageNumber,
      signal: input.signal,
      sourcePdfPath,
    });

    let pngBytes: Buffer;
    try {
      pngBytes = await readFile(pagePngPath);
    } catch (error) {
      throw new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered", {
        cause: error,
      });
    }

    const baseImage = sharp(pngBytes).rotate();
    const metadata = await baseImage.metadata();

    if (!metadata.width || !metadata.height) {
      throw new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered");
    }

    const primaryAttempt = await renderWebpBuffer(pngBytes, 82);
    const webpBytes =
      primaryAttempt.byteLength <= input.maxOutputBytes
        ? primaryAttempt
        : await renderWebpBuffer(pngBytes, 68);

    if (webpBytes.byteLength > input.maxOutputBytes) {
      throw new PdfPreviewError(
        "PDF_RENDER_FAILED",
        "Rendered PDF page exceeds the secure preview output limit",
      );
    }

    return {
      bytes: webpBytes,
      height: metadata.height,
      mimeType: "image/webp",
      width: metadata.width,
    };
  } catch (error) {
    if (error instanceof PdfPreviewError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw error;
    }

    throw new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered", {
      cause: error,
    });
  } finally {
    await cleanupTempDir(tempDir);
  }
}

async function runPdftocairo(input: {
  dpi: number;
  outputBasePath: string;
  pageNumber: number;
  signal?: AbortSignal;
  sourcePdfPath: string;
}) {
  const { rendererPath } = getSharedPdfPreviewConfig();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      rendererPath,
      [
        "-png",
        "-singlefile",
        "-f",
        String(input.pageNumber),
        "-l",
        String(input.pageNumber),
        "-r",
        String(input.dpi),
        input.sourcePdfPath,
        input.outputBasePath,
      ],
      {
        stdio: "ignore",
      },
    );

    const abortHandler = () => {
      child.kill();
      reject(input.signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };

    if (input.signal?.aborted) {
      abortHandler();
      return;
    }

    input.signal?.addEventListener("abort", abortHandler, { once: true });

    child.once("error", (error) => {
      input.signal?.removeEventListener("abort", abortHandler);
      reject(
        new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered", {
          cause: error,
        }),
      );
    });

    child.once("exit", (code) => {
      input.signal?.removeEventListener("abort", abortHandler);

      if (code === 0) {
        resolve();
        return;
      }

      reject(new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered"));
    });
  });
}

async function renderWebpBuffer(pngBytes: Buffer, quality: number) {
  try {
    return await sharp(pngBytes).rotate().webp({ effort: 4, quality }).toBuffer();
  } catch (error) {
    throw new PdfPreviewError("PDF_RENDER_FAILED", "PDF page could not be rendered", {
      cause: error,
    });
  }
}

async function cleanupTempDir(tempDir: string) {
  try {
    await rm(tempDir, { force: true, recursive: true });
  } catch (error) {
    console.error("Failed to clean up shared PDF preview temp directory", {
      error: error instanceof Error ? error.message : String(error),
      tempDir,
    });
  }
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}
