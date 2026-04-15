import "server-only";

import { ALLOWED_IMAGE_TYPES, MAX_PDF_INDEXING_SIZE_BYTES } from "@/lib/constants";
import { getSemanticConfig } from "@/lib/ai/config";
import type { EmbeddingErrorCode } from "@/lib/ai/embeddings/errors";
import type { EmbeddingModality } from "@/lib/ai/embeddings/types";

export type SemanticEligibilityResult =
  | { eligible: true; modality: EmbeddingModality }
  | { eligible: false; errorCode: Extract<EmbeddingErrorCode, "FILE_TOO_LARGE" | "UNSUPPORTED_MIME"> };

const ELIGIBLE_IMAGE_MIME_TYPES = new Set<string>(ALLOWED_IMAGE_TYPES);

export function getSemanticEligibility(input: {
  mimeType: string;
  modality: EmbeddingModality;
  size: number;
}): SemanticEligibilityResult {
  if (input.modality === "image") {
    return ELIGIBLE_IMAGE_MIME_TYPES.has(input.mimeType)
      ? { eligible: true, modality: "image" }
      : { eligible: false, errorCode: "UNSUPPORTED_MIME" };
  }

  if (input.mimeType !== "application/pdf") {
    return { eligible: false, errorCode: "UNSUPPORTED_MIME" };
  }

  const { pdfIndexingMaxBytes } = getSemanticConfig();
  const maxBytes = Math.min(pdfIndexingMaxBytes, MAX_PDF_INDEXING_SIZE_BYTES);

  return input.size <= maxBytes
    ? { eligible: true, modality: "pdf" }
    : { eligible: false, errorCode: "FILE_TOO_LARGE" };
}

export function isSemanticIndexingEligible(input: {
  mimeType: string;
  modality: EmbeddingModality;
  size: number;
}) {
  return getSemanticEligibility(input).eligible;
}
