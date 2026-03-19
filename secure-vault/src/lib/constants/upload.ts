import { BYTES_PER_GIGABYTE, BYTES_PER_MEGABYTE } from "./bytes";

export const UPLOAD_CHUNK_SIZE_BYTES = 5 * BYTES_PER_MEGABYTE;
export const MAX_UPLOAD_SIZE_BYTES = 100 * BYTES_PER_MEGABYTE;
export const MAX_PDF_INDEXING_SIZE_BYTES = 10 * BYTES_PER_MEGABYTE;
export const DEFAULT_STORAGE_QUOTA_BYTES = BYTES_PER_GIGABYTE;
export const UPLOAD_SESSION_EXPIRY_HOURS = 24;
export const UPLOAD_SESSION_EXPIRY_MS = UPLOAD_SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
export const UPLOAD_INIT_LOCK_TIMEOUT_SECONDS = 5;
export const UPLOAD_CHUNK_LOCK_TIMEOUT_SECONDS = 5;
export const PENDING_FILE_MIME_TYPE = "application/octet-stream";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
] as const;

export const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
] as const;

export type AllowedMimeType = typeof ALLOWED_FILE_TYPES[number];
export type AllowedImageType = typeof ALLOWED_IMAGE_TYPES[number];
export type AllowedDocumentType = typeof ALLOWED_DOCUMENT_TYPES[number];

export function isAllowedFileType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_FILE_TYPES as readonly string[]).includes(mime);
}

export function isAllowedImageType(mime: string): mime is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
}

export function isAllowedDocumentType(mime: string): mime is AllowedDocumentType {
  return (ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(mime);
}
