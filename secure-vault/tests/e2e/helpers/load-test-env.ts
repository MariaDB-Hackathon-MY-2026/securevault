import { loadEnvConfig } from "@next/env";

let isLoaded = false;

export function ensureTestEnvLoaded() {
  if (isLoaded) {
    return;
  }

  loadEnvConfig(process.cwd());
  preferDeterministicSemanticConfigForE2E();
  preferLocalRedisForE2E();
  isLoaded = true;
}

function preferDeterministicSemanticConfigForE2E() {
  if (!process.env.SEMANTIC_INDEXING_ENABLED?.trim()) {
    process.env.SEMANTIC_INDEXING_ENABLED = "true";
  }

  if (!process.env.SEMANTIC_INDEXING_EXECUTION_MODE?.trim()) {
    process.env.SEMANTIC_INDEXING_EXECUTION_MODE = "inline";
  }

  if (!process.env.SEMANTIC_INDEXING_PROVIDER?.trim()) {
    process.env.SEMANTIC_INDEXING_PROVIDER = process.env.GEMINI_API_KEY?.trim()
      ? "google"
      : "fake";
  }

  if (!process.env.GEMINI_EMBEDDING_MODEL?.trim()) {
    process.env.GEMINI_EMBEDDING_MODEL = "gemini-embedding-2-preview";
  }
}

function preferLocalRedisForE2E() {
  const shouldUseLocalRedis = process.env.PLAYWRIGHT_USE_LOCAL_REDIS !== "0";

  if (!shouldUseLocalRedis) {
    return;
  }

  const configuredRedisUrl = process.env.PLAYWRIGHT_REDIS_URL?.trim() || process.env.REDIS_URL?.trim();

  process.env.REDIS_URL = configuredRedisUrl || "redis://127.0.0.1:6379";
}
