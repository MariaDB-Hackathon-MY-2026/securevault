import { describe, expect, it, vi } from "vitest";

import { getSemanticEligibility } from "@/lib/ai/embeddings/eligibility";

describe("semantic indexing eligibility", () => {
  it("keeps avif parity with the upload allow-list", () => {
    const result = getSemanticEligibility({
      mimeType: "image/avif",
      modality: "image",
      size: 1024,
    });

    expect(result).toEqual({
      eligible: true,
      modality: "image",
    });
  });

  it("rejects unsupported image mime types", () => {
    const result = getSemanticEligibility({
      mimeType: "image/heic",
      modality: "image",
      size: 1024,
    });

    expect(result).toEqual({
      eligible: false,
      errorCode: "UNSUPPORTED_MIME",
    });
  });

  it("rejects oversized pdfs", () => {
    const result = getSemanticEligibility({
      mimeType: "application/pdf",
      modality: "pdf",
      size: 10 * 1024 * 1024 + 1,
    });

    expect(result).toEqual({
      eligible: false,
      errorCode: "FILE_TOO_LARGE",
    });
  });
});
