import "server-only";

export type PdfPreviewErrorCode =
  | "FEATURE_DISABLED"
  | "RENDERER_UNAVAILABLE"
  | "SHARE_ACCESS_DENIED"
  | "FILE_NOT_FOUND"
  | "UNSUPPORTED_MIME"
  | "PDF_TOO_LARGE"
  | "PDF_TOO_MANY_PAGES"
  | "INVALID_PAGE"
  | "PAGE_NOT_FOUND"
  | "PDF_RENDER_FAILED"
  | "PDF_PARSE_FAILED"
  | "R2_READ_FAILED"
  | "R2_WRITE_FAILED"
  | "DECRYPT_FAILED";

const PDF_PREVIEW_ERROR_STATUSES: Record<PdfPreviewErrorCode, number> = {
  DECRYPT_FAILED: 500,
  FEATURE_DISABLED: 503,
  FILE_NOT_FOUND: 404,
  INVALID_PAGE: 400,
  PAGE_NOT_FOUND: 404,
  PDF_PARSE_FAILED: 422,
  PDF_RENDER_FAILED: 422,
  PDF_TOO_LARGE: 413,
  PDF_TOO_MANY_PAGES: 413,
  R2_READ_FAILED: 500,
  R2_WRITE_FAILED: 500,
  RENDERER_UNAVAILABLE: 503,
  SHARE_ACCESS_DENIED: 403,
  UNSUPPORTED_MIME: 415,
};

export class PdfPreviewError extends Error {
  code: PdfPreviewErrorCode;
  status: number;

  constructor(code: PdfPreviewErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = "PdfPreviewError";
    this.status = PDF_PREVIEW_ERROR_STATUSES[code];
  }
}

export function isPdfPreviewError(error: unknown): error is PdfPreviewError {
  return error instanceof PdfPreviewError;
}

export function toPdfPreviewErrorResponse(error: PdfPreviewError) {
  return {
    error: error.message,
    status: error.status,
  };
}
