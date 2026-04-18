import "server-only";

import type { EmbeddingErrorCode } from "@/lib/ai/embeddings/errors";

export type EmbeddingJobStatus = "queued" | "processing" | "ready" | "skipped" | "failed";
export type EmbeddingModality = "image" | "pdf";
export type EmbeddingChunkType = "full" | "page" | "window";

export type EmbeddingJobRecord = {
  attemptCount: number;
  completedAt: Date | null;
  embeddingDimensions: number;
  embeddingModel: string;
  errorCode: EmbeddingErrorCode | null;
  errorMessage: string | null;
  fileId: string;
  fileSize: number;
  id: string;
  lastHeartbeatAt: Date | null;
  leaseExpiresAt: Date | null;
  mimeType: string;
  modality: EmbeddingModality;
  processorId: string | null;
  retryable: boolean;
  startedAt: Date | null;
  status: EmbeddingJobStatus;
  triggeredBy: string | null;
  updatedAt: Date;
};

export type EmbeddingChunkRecord = {
  chunkIndex: number;
  chunkType: EmbeddingChunkType;
  embedding: string;
  fileId: string;
  id: string;
  jobId: string;
  modality: EmbeddingModality;
  pageFrom: number | null;
  pageTo: number | null;
};

export type EmbeddingChunkPayload = {
  bytes: Buffer;
  chunkIndex: number;
  chunkType: EmbeddingChunkType;
  contextLabel: string;
  mimeType: string;
  pageFrom: number | null;
  pageTo: number | null;
};

export type StartEmbeddingAction = "enqueue" | "retry" | "reindex";

export type StartEmbeddingJobRequest = {
  action?: StartEmbeddingAction;
  fileId: string;
  modality: EmbeddingModality;
};

export type StartEmbeddingJobResponse = {
  accepted: boolean;
  attemptCount: number;
  errorCode: EmbeddingErrorCode | null;
  fileId: string;
  jobId: string;
  modality: EmbeddingModality;
  retryable: boolean;
  status: EmbeddingJobStatus;
  updatedAt: string;
};

export type EmbeddingJobStatusItem = {
  attemptCount: number;
  completedAt: string | null;
  errorCode: EmbeddingErrorCode | null;
  errorMessage: string | null;
  jobId: string;
  modality: EmbeddingModality;
  retryable: boolean;
  startedAt: string | null;
  status: EmbeddingJobStatus;
  updatedAt: string;
};

export type GetEmbeddingStatusResponse = {
  fileId: string;
  jobs: EmbeddingJobStatusItem[];
};
