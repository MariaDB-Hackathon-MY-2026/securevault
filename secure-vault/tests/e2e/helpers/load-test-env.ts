import { loadEnvConfig } from "@next/env";

let isLoaded = false;

export function ensureTestEnvLoaded() {
  if (isLoaded) {
    return;
  }

  loadEnvConfig(process.cwd());
  preferLocalRedisForE2E();
  isLoaded = true;
}

function preferLocalRedisForE2E() {
  const shouldUseLocalRedis = process.env.PLAYWRIGHT_USE_LOCAL_REDIS !== "0";

  if (!shouldUseLocalRedis) {
    return;
  }

  const configuredRedisUrl = process.env.PLAYWRIGHT_REDIS_URL?.trim() || process.env.REDIS_URL?.trim();

  process.env.REDIS_URL = configuredRedisUrl || "redis://127.0.0.1:6379";
}
