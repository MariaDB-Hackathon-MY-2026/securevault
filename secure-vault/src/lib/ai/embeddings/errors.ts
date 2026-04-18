import "server-only";

export type EmbeddingErrorCode =
  | "SEMANTIC_INDEXING_DISABLED"
  | "SEMANTIC_INDEXING_UNAVAILABLE"
  | "UNSUPPORTED_MIME"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_READY"
  | "FILE_DELETED"
  | "DECRYPT_FAILED"
  | "R2_READ_FAILED"
  | "PDF_PARSE_FAILED"
  | "EMBEDDING_PROVIDER_FAILED"
  | "EMBEDDING_PROVIDER_TIMEOUT"
  | "VECTOR_DIMENSION_MISMATCH"
  | "JOB_LEASE_EXPIRED";

export type RouteErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | EmbeddingErrorCode;

export type RouteErrorResponse = {
  errorCode: RouteErrorCode;
  message: string;
  retryable: boolean;
};

const RETRYABLE_ERROR_CODES = new Set<EmbeddingErrorCode>([
  "EMBEDDING_PROVIDER_FAILED",
  "EMBEDDING_PROVIDER_TIMEOUT",
  "JOB_LEASE_EXPIRED",
  "R2_READ_FAILED",
]);

export class EmbeddingError extends Error {
  code: EmbeddingErrorCode;
  retryable: boolean;

  constructor(code: EmbeddingErrorCode, message: string, options?: { cause?: unknown; retryable?: boolean }) {
    super(message, options);
    this.code = code;
    this.name = "EmbeddingError";
    this.retryable = options?.retryable ?? RETRYABLE_ERROR_CODES.has(code);
  }
}

export function isRetryableEmbeddingErrorCode(code: EmbeddingErrorCode | null | undefined) {
  return code ? RETRYABLE_ERROR_CODES.has(code) : false;
}

export function toRouteErrorResponse(
  errorCode: RouteErrorCode,
  message: string,
  retryable: boolean,
): RouteErrorResponse {
  return {
    errorCode,
    message,
    retryable,
  };
}
