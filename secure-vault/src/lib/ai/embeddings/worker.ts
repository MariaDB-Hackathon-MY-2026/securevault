import "server-only";

import { dequeueEmbeddingMessage } from "@/lib/ai/embeddings/embedding-queue";
import { processEmbeddingJob } from "@/lib/ai/embeddings/embedding-processor";

export async function runEmbeddingWorker(signal?: AbortSignal) {
  while (!signal?.aborted) {
    const message = await dequeueEmbeddingMessage(signal);
    if (!message) {
      continue;
    }

    try {
      await processEmbeddingJob({ jobId: message.jobId });
    } catch (error) {
      console.error("Embedding worker failed to process job", error);
    }
  }
}
