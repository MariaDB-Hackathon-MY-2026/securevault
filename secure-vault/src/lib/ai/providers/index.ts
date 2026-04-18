import "server-only";

import { getSemanticConfig } from "@/lib/ai/config";
import { createFakeEmbeddingProvider } from "@/lib/ai/providers/fake";
import { createGoogleEmbeddingProvider } from "@/lib/ai/providers/google";

let cachedProvider:
  | ReturnType<typeof createFakeEmbeddingProvider>
  | ReturnType<typeof createGoogleEmbeddingProvider>
  | null = null;

export function getEmbeddingProvider() {
  if (cachedProvider) {
    return cachedProvider;
  }

  const config = getSemanticConfig();
  cachedProvider = config.provider === "fake"
    ? createFakeEmbeddingProvider()
    : createGoogleEmbeddingProvider();

  return cachedProvider;
}

export function resetEmbeddingProviderForTests() {
  cachedProvider = null;
}
