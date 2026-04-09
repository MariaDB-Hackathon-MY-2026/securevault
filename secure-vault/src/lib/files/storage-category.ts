import type { StorageCategory } from "@/lib/files/types";

const DOCUMENT_MIME_TYPES = new Set([
  "application/epub+zip",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/rtf",
  "text/tab-separated-values",
]);

const ARCHIVE_MIME_TYPES = new Set([
  "application/gzip",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/x-bzip",
  "application/x-bzip2",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/x-zip-compressed",
  "application/zip",
]);

export function classifyStorageCategory(mimeType: string | null | undefined): StorageCategory {
  const normalizedMimeType = mimeType?.trim().toLowerCase();

  if (!normalizedMimeType) {
    return "other";
  }

  if (normalizedMimeType.startsWith("image/")) {
    return "images";
  }

  if (normalizedMimeType.startsWith("video/")) {
    return "videos";
  }

  if (normalizedMimeType.startsWith("audio/")) {
    return "audio";
  }

  if (
    normalizedMimeType.startsWith("text/") ||
    DOCUMENT_MIME_TYPES.has(normalizedMimeType) ||
    normalizedMimeType.includes("word") ||
    normalizedMimeType.includes("excel") ||
    normalizedMimeType.includes("sheet") ||
    normalizedMimeType.includes("presentation") ||
    normalizedMimeType.includes("powerpoint") ||
    normalizedMimeType.includes("document")
  ) {
    return "documents";
  }

  if (
    ARCHIVE_MIME_TYPES.has(normalizedMimeType) ||
    normalizedMimeType.includes("zip") ||
    normalizedMimeType.includes("compress") ||
    normalizedMimeType.includes("archive") ||
    normalizedMimeType.includes("tar")
  ) {
    return "archives";
  }

  return "other";
}
