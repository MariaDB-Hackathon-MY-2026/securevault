import "server-only";

import { z } from "zod";

import { hasRedisConfiguration } from "@/lib/redis";

const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2-preview";

const envSchema = z.object({
  EMBEDDING_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_EMBEDDING_MODEL: z.string().trim().optional(),
  PDF_FULL_EMBED_MAX_PAGES: z.coerce.number().int().positive().default(6),
  PDF_INDEXING_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  PDF_WINDOW_OVERLAP_PAGES: z.coerce.number().int().min(0).default(1),
  PDF_WINDOW_SIZE_PAGES: z.coerce.number().int().positive().default(6),
  SEMANTIC_INDEXING_ENABLED: z
    .string()
    .trim()
    .optional()
    .transform((value) => value === "1" || value === "true"),
  SEMANTIC_INDEXING_EXECUTION_MODE: z.enum(["inline", "queued"]).default("inline"),
  SEMANTIC_INDEXING_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  SEMANTIC_INDEXING_MAX_SCORE_GAP: z.coerce.number().min(0).max(2).default(0.05),
  SEMANTIC_INDEXING_MAX_RETRY_ATTEMPTS: z.coerce.number().int().min(0).default(3),
  SEMANTIC_INDEXING_MIN_SIMILARITY: z.coerce.number().min(-1).max(1).default(0.35),
  SEMANTIC_INDEXING_PROVIDER: z.enum(["google", "fake"]).default("google"),
  SEMANTIC_INDEXING_QUERY_TOP_K: z.coerce.number().int().min(25).max(200).default(50),
  SEMANTIC_INDEXING_RETRY_BACKOFF_MS: z.coerce.number().int().min(100).default(1_000),
});

export type SemanticExecutionMode = "inline" | "queued";
export type SemanticProviderId = "fake" | "google";

export type SemanticConfig = {
  embeddingDimensions: number;
  embeddingRequestTimeoutMs: number;
  enabled: boolean;
  executionMode: SemanticExecutionMode;
  geminiApiKey: string | null;
  geminiEmbeddingModel: string;
  leaseDurationMs: number;
  maxConcurrency: number;
  maxScoreGap: number;
  maxRetryAttempts: number;
  minSimilarity: number;
  pdfFullEmbedMaxPages: number;
  pdfIndexingMaxBytes: number;
  pdfWindowOverlapPages: number;
  pdfWindowSizePages: number;
  provider: SemanticProviderId;
  queryTopK: number;
  retryBackoffMs: number;
};

let cachedConfig: SemanticConfig | null = null;

function isProductionEnvironment() {
  return process.env.NODE_ENV === "production";
}

export function getSemanticConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsedEnv = envSchema.parse(process.env);

  if (parsedEnv.PDF_FULL_EMBED_MAX_PAGES !== 6) {
    throw new Error("PDF_FULL_EMBED_MAX_PAGES must be 6 for the v1 semantic indexing contract.");
  }

  if (parsedEnv.PDF_WINDOW_SIZE_PAGES !== 6) {
    throw new Error("PDF_WINDOW_SIZE_PAGES must be 6 for the v1 semantic indexing contract.");
  }

  if (parsedEnv.PDF_WINDOW_OVERLAP_PAGES !== 1) {
    throw new Error("PDF_WINDOW_OVERLAP_PAGES must be 1 for the v1 semantic indexing contract.");
  }

  if (parsedEnv.PDF_WINDOW_OVERLAP_PAGES >= parsedEnv.PDF_WINDOW_SIZE_PAGES) {
    throw new Error("PDF_WINDOW_OVERLAP_PAGES must be smaller than PDF_WINDOW_SIZE_PAGES.");
  }

  if (parsedEnv.SEMANTIC_INDEXING_ENABLED && parsedEnv.SEMANTIC_INDEXING_PROVIDER === "fake" && isProductionEnvironment()) {
    throw new Error("SEMANTIC_INDEXING_PROVIDER=fake is not allowed in production.");
  }

  if (
    parsedEnv.SEMANTIC_INDEXING_ENABLED
    && parsedEnv.SEMANTIC_INDEXING_PROVIDER === "google"
    && !parsedEnv.GEMINI_API_KEY?.trim()
  ) {
    throw new Error("GEMINI_API_KEY is required when SEMANTIC_INDEXING_PROVIDER=google.");
  }

  if (
    parsedEnv.SEMANTIC_INDEXING_EXECUTION_MODE === "queued"
    && parsedEnv.SEMANTIC_INDEXING_ENABLED
    && !hasRedisConfiguration()
  ) {
    throw new Error(
      "SEMANTIC_INDEXING_EXECUTION_MODE=queued requires REDIS_URL and Redis availability.",
    );
  }

  cachedConfig = {
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    embeddingRequestTimeoutMs: parsedEnv.EMBEDDING_REQUEST_TIMEOUT_MS,
    enabled: parsedEnv.SEMANTIC_INDEXING_ENABLED,
    executionMode: parsedEnv.SEMANTIC_INDEXING_EXECUTION_MODE,
    geminiApiKey: parsedEnv.GEMINI_API_KEY?.trim() ?? null,
    geminiEmbeddingModel: parsedEnv.GEMINI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    leaseDurationMs: Math.max(parsedEnv.EMBEDDING_REQUEST_TIMEOUT_MS * 2, 60_000),
    maxConcurrency: parsedEnv.SEMANTIC_INDEXING_MAX_CONCURRENCY,
    maxScoreGap: parsedEnv.SEMANTIC_INDEXING_MAX_SCORE_GAP,
    maxRetryAttempts: parsedEnv.SEMANTIC_INDEXING_MAX_RETRY_ATTEMPTS,
    minSimilarity: parsedEnv.SEMANTIC_INDEXING_MIN_SIMILARITY,
    pdfFullEmbedMaxPages: parsedEnv.PDF_FULL_EMBED_MAX_PAGES,
    pdfIndexingMaxBytes: parsedEnv.PDF_INDEXING_MAX_BYTES,
    pdfWindowOverlapPages: parsedEnv.PDF_WINDOW_OVERLAP_PAGES,
    pdfWindowSizePages: parsedEnv.PDF_WINDOW_SIZE_PAGES,
    provider: parsedEnv.SEMANTIC_INDEXING_PROVIDER,
    queryTopK: parsedEnv.SEMANTIC_INDEXING_QUERY_TOP_K,
    retryBackoffMs: parsedEnv.SEMANTIC_INDEXING_RETRY_BACKOFF_MS,
  };

  return cachedConfig;
}

export function isSemanticIndexingEnabled() {
  return getSemanticConfig().enabled;
}

export function resetSemanticConfigForTests() {
  cachedConfig = null;
}
