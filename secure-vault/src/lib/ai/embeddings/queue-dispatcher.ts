import "server-only";

import type { EmbeddingDispatcher } from "@/lib/ai/embeddings/dispatcher";
import { enqueueEmbeddingMessage } from "@/lib/ai/embeddings/embedding-queue";
import type { EmbeddingJobRecord } from "@/lib/ai/embeddings/types";

export class QueueEmbeddingDispatcher implements EmbeddingDispatcher {
  async dispatch(job: EmbeddingJobRecord) {
    await enqueueEmbeddingMessage({
      attemptCount: job.attemptCount,
      fileId: job.fileId,
      jobId: job.id,
      modality: job.modality,
    });
  }
}
