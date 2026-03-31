import { ALLOWED_DOCUMENT_TYPES, ALLOWED_IMAGE_TYPES } from "@/lib/constants/upload";

const PREVIEWABLE_MIME_TYPES = new Set<string>([
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
]);

export function canPreviewMime(mime: string) {
  return PREVIEWABLE_MIME_TYPES.has(mime);
}
