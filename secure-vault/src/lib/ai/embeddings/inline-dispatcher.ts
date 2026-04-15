import "server-only";

import type { EmbeddingDispatcher } from "@/lib/ai/embeddings/dispatcher";
import { processEmbeddingJob } from "@/lib/ai/embeddings/embedding-processor";
import type { EmbeddingJobRecord } from "@/lib/ai/embeddings/types";

export class InlineEmbeddingDispatcher implements EmbeddingDispatcher {
  async dispatch(job: EmbeddingJobRecord) {
    queueMicrotask(() => {
      void processEmbeddingJob({ jobId: job.id }).catch((error) => {
        console.error("Inline semantic indexing failed", error);
      });
    });
  }
}
