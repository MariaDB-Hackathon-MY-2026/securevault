import "server-only";

import { EmbeddingJobRepository } from "@/lib/ai/embeddings/embedding-job-repository";

const repository = new EmbeddingJobRepository();

export async function persistEmbeddings(input: {
  chunks: Array<{
    chunkIndex: number;
    chunkType: "full" | "page" | "window";
    embedding: string;
    pageFrom: number | null;
    pageTo: number | null;
  }>;
  fileId: string;
  jobId: string;
  modality: "image" | "pdf";
  now: Date;
  processorId: string;
}) {
  return repository.finalizeJobReady(input);
}
