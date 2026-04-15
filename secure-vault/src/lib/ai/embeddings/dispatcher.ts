import "server-only";

import { getSemanticConfig } from "@/lib/ai/config";
import { InlineEmbeddingDispatcher } from "@/lib/ai/embeddings/inline-dispatcher";
import { QueueEmbeddingDispatcher } from "@/lib/ai/embeddings/queue-dispatcher";
import type { EmbeddingJobRecord } from "@/lib/ai/embeddings/types";

export interface EmbeddingDispatcher {
  dispatch(job: EmbeddingJobRecord): Promise<void>;
}

let cachedDispatcher: EmbeddingDispatcher | null = null;

export function getEmbeddingDispatcher() {
  if (cachedDispatcher) {
    return cachedDispatcher;
  }

  cachedDispatcher = getSemanticConfig().executionMode === "queued"
    ? new QueueEmbeddingDispatcher()
    : new InlineEmbeddingDispatcher();

  return cachedDispatcher;
}

export function resetEmbeddingDispatcherForTests() {
  cachedDispatcher = null;
}
