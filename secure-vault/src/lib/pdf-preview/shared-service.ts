import "server-only";

import { nanoid } from "nanoid";

import { createDecryptStream, createEncryptStream, decryptFEK } from "@/lib/crypto";
import { readSharedFileBytes } from "@/lib/files/file-bytes";
import { getSharedPdfPreviewConfig } from "@/lib/pdf-preview/config";
import { PdfPreviewError } from "@/lib/pdf-preview/errors";
import { assertPdfRendererAvailable } from "@/lib/pdf-preview/renderer-probe";
import { getPdfPageCount, renderPdfPageToWebp } from "@/lib/pdf-preview/renderer";
import {
  getPreviewPage,
  insertReadyPreviewPage,
  isDuplicatePreviewPageInsertError,
  listPreviewPages,
} from "@/lib/pdf-preview/repository";
import type { PdfPreviewManifest } from "@/lib/pdf-preview/types";
import { buildPdfPreviewR2Key, deleteObject, getObjectStream, putObject } from "@/lib/storage/r2";

function createPreviewPageResponse(imageBytes: Buffer) {
  const responseBody = new ArrayBuffer(imageBytes.byteLength);
  new Uint8Array(responseBody).set(imageBytes);

  return new Response(responseBody, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(imageBytes.byteLength),
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
    },
    status: 200,
  });
}

function createPageSrc(pageBaseUrl: string, pageNumber: number) {
  return `${pageBaseUrl}/${pageNumber}`;
}

function assertPreviewablePdf(input: {
  file: { mimeType: string; size: number };
  maxBytes: number;
}) {
  if (input.file.mimeType !== "application/pdf") {
    throw new PdfPreviewError(
      "UNSUPPORTED_MIME",
      "PDF image preview is only supported for PDF files",
    );
  }

  if (input.file.size > input.maxBytes) {
    throw new PdfPreviewError("PDF_TOO_LARGE", "PDF is too large for secure preview");
  }
}

async function collectStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value.byteLength > 0) {
      chunks.push(Buffer.from(value));
    }
  }

  return Buffer.concat(chunks);
}

function bufferToStream(buffer: Buffer) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });
}

async function encryptPreviewImageBytes(fileFek: Buffer, imageBytes: Buffer) {
  const encryptor = createEncryptStream(fileFek);
  const encryptedBytes = await collectStream(
    bufferToStream(imageBytes).pipeThrough(encryptor.stream),
  );

  return {
    authTag: encryptor.getAuthTag(),
    encryptedBytes,
    iv: encryptor.getIV(),
  };
}

async function readCachedPreviewImage(input: {
  authTag: Buffer;
  fek: Buffer;
  iv: Buffer;
  r2Key: string;
  signal?: AbortSignal;
}) {
  try {
    const encryptedStream = await getObjectStream(input.r2Key, input.signal);
    const decryptedStream = encryptedStream.pipeThrough(
      createDecryptStream(input.fek, input.iv, input.authTag),
    );

    return await collectStream(decryptedStream);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("decrypt")) {
      throw new PdfPreviewError("DECRYPT_FAILED", "Failed to decrypt secure preview image", {
        cause: error,
      });
    }

    throw new PdfPreviewError("R2_READ_FAILED", "Failed to read secure preview image", {
      cause: error,
    });
  }
}

async function cleanupUploadedPreviewObject(input: {
  fileId: string;
  pageNumber: number;
  r2Key: string;
}) {
  try {
    await deleteObject(input.r2Key);
  } catch (error) {
    console.error("Failed to clean up uploaded PDF preview object", {
      error: error instanceof Error ? error.message : String(error),
      fileId: input.fileId,
      pageNumber: input.pageNumber,
      r2Key: input.r2Key,
    });
  }
}

export async function getSharedPdfPreviewManifest(input: {
  fileId: string;
  ownerId: string;
  pageBaseUrl: string;
  signal?: AbortSignal;
}): Promise<PdfPreviewManifest> {
  const config = getSharedPdfPreviewConfig();

  if (!config.enabled) {
    throw new PdfPreviewError("FEATURE_DISABLED", "PDF image preview is not enabled");
  }

  await assertPdfRendererAvailable();

  const sharedFile = await readSharedFileBytes({
    fileId: input.fileId,
    ownerId: input.ownerId,
    signal: input.signal,
  });

  if (!sharedFile) {
    throw new PdfPreviewError("FILE_NOT_FOUND", "Share link not found");
  }

  assertPreviewablePdf({
    file: sharedFile.file,
    maxBytes: config.maxBytes,
  });

  const pageCount = await getPdfPageCount({ bytes: sharedFile.bytes });

  if (pageCount > config.maxPages) {
    throw new PdfPreviewError("PDF_TOO_MANY_PAGES", "PDF has too many pages for secure preview");
  }

  const storedPages = await listPreviewPages({
    fileId: input.fileId,
    renderVersion: config.renderVersion,
  });
  const previewPagesByPageNumber = new Map(storedPages.map((page) => [page.page_number, page]));

  return {
    fileId: input.fileId,
    fileName: sharedFile.file.name,
    mimeType: sharedFile.file.mimeType,
    pageCount,
    pages: Array.from({ length: pageCount }, (_, index) => {
      const pageNumber = index + 1;
      const storedPage = previewPagesByPageNumber.get(pageNumber);

      if (!storedPage) {
        return {
          height: null,
          page: pageNumber,
          src: createPageSrc(input.pageBaseUrl, pageNumber),
          status: "pending" as const,
          width: null,
        };
      }

      return {
        height: storedPage.status === "ready" ? storedPage.height : null,
        page: pageNumber,
        src: createPageSrc(input.pageBaseUrl, pageNumber),
        status: storedPage.status,
        width: storedPage.status === "ready" ? storedPage.width : null,
      };
    }),
    renderVersion: config.renderVersion,
  };
}

export async function getSharedPdfPreviewPage(input: {
  fileId: string;
  ownerId: string;
  pageNumber: number;
  signal?: AbortSignal;
}): Promise<Response> {
  if (!Number.isInteger(input.pageNumber) || input.pageNumber <= 0) {
    throw new PdfPreviewError("INVALID_PAGE", "Page must be a positive integer");
  }

  const config = getSharedPdfPreviewConfig();

  if (!config.enabled) {
    throw new PdfPreviewError("FEATURE_DISABLED", "PDF image preview is not enabled");
  }

  await assertPdfRendererAvailable();

  const sharedFile = await readSharedFileBytes({
    fileId: input.fileId,
    ownerId: input.ownerId,
    signal: input.signal,
  });

  if (!sharedFile) {
    throw new PdfPreviewError("FILE_NOT_FOUND", "Share link not found");
  }

  assertPreviewablePdf({
    file: sharedFile.file,
    maxBytes: config.maxBytes,
  });

  const pageCount = await getPdfPageCount({ bytes: sharedFile.bytes });

  if (pageCount > config.maxPages) {
    throw new PdfPreviewError("PDF_TOO_MANY_PAGES", "PDF has too many pages for secure preview");
  }

  if (input.pageNumber > pageCount) {
    throw new PdfPreviewError("PAGE_NOT_FOUND", "PDF preview page not found");
  }

  let fileFek: Buffer;
  try {
    fileFek = decryptFEK(sharedFile.file.encryptedFek, sharedFile.ownerUek);
  } catch (error) {
    throw new PdfPreviewError("DECRYPT_FAILED", "Failed to decrypt the file encryption key", {
      cause: error,
    });
  }

  const existingPage = await getPreviewPage({
    fileId: input.fileId,
    pageNumber: input.pageNumber,
    renderVersion: config.renderVersion,
  });

  if (existingPage?.status === "ready") {
    const imageBytes = await readCachedPreviewImage({
      authTag: existingPage.auth_tag,
      fek: fileFek,
      iv: existingPage.iv,
      r2Key: existingPage.r2_key,
      signal: input.signal,
    });

    return createPreviewPageResponse(imageBytes);
  }

  if (existingPage?.status === "failed") {
    throw new PdfPreviewError(
      "PDF_RENDER_FAILED",
      existingPage.error_message || "PDF cannot be rendered for secure preview",
    );
  }

  const renderedPage = await renderPdfPageToWebp({
    bytes: sharedFile.bytes,
    dpi: config.dpi,
    maxOutputBytes: config.maxPageImageBytes,
    pageNumber: input.pageNumber,
    signal: input.signal,
  });
  const encryptedPreview = await encryptPreviewImageBytes(fileFek, renderedPage.bytes);
  const r2Key = buildPdfPreviewR2Key({
    fileId: input.fileId,
    pageNumber: input.pageNumber,
    renderVersion: config.renderVersion,
    userId: input.ownerId,
  });

  try {
    await putObject(r2Key, encryptedPreview.encryptedBytes, "application/octet-stream");
  } catch (error) {
    throw new PdfPreviewError("R2_WRITE_FAILED", "Failed to store secure preview image", {
      cause: error,
    });
  }

  try {
    await insertReadyPreviewPage({
      authTag: encryptedPreview.authTag,
      fileId: input.fileId,
      height: renderedPage.height,
      id: nanoid(),
      iv: encryptedPreview.iv,
      mimeType: renderedPage.mimeType,
      pageNumber: input.pageNumber,
      r2Key,
      renderVersion: config.renderVersion,
      size: renderedPage.bytes.byteLength,
      width: renderedPage.width,
    });
  } catch (error) {
    if (isDuplicatePreviewPageInsertError(error)) {
      await cleanupUploadedPreviewObject({
        fileId: input.fileId,
        pageNumber: input.pageNumber,
        r2Key,
      });

      const duplicateWinner = await getPreviewPage({
        fileId: input.fileId,
        pageNumber: input.pageNumber,
        renderVersion: config.renderVersion,
      });

      if (duplicateWinner?.status === "ready") {
        const imageBytes = await readCachedPreviewImage({
          authTag: duplicateWinner.auth_tag,
          fek: fileFek,
          iv: duplicateWinner.iv,
          r2Key: duplicateWinner.r2_key,
          signal: input.signal,
        });

        return createPreviewPageResponse(imageBytes);
      }
    }

    await cleanupUploadedPreviewObject({
      fileId: input.fileId,
      pageNumber: input.pageNumber,
      r2Key,
    });
    throw new PdfPreviewError("R2_WRITE_FAILED", "Failed to persist secure preview metadata", {
      cause: error,
    });
  }

  return createPreviewPageResponse(renderedPage.bytes);
}
