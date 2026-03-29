import { sliceFilesWithMetaData } from "@/lib/storage/chunker";

import type { UploadChunkResponse } from "@/app/api/upload/chunk/types";
import type { CompleteUploadResponse } from "@/app/api/upload/complete/types";
import type { InitUploadResponse } from "@/app/api/upload/init/types";
import type { UploadStatusResponse } from "@/app/api/upload/status/types";
import {
  CHUNK_RETRY_BASE_DELAY_MS,
  MAX_CHUNK_UPLOAD_RETRIES,
  MAX_RETRY_JITTER_MS,
  RATE_LIMIT_RETRY_BASE_DELAY_MS,
} from "@/lib/upload/upload-job.constants";
import { isAllowedFileType } from "@/lib/constants";
import { createUploadJobErrorFromHttp, UploadJobError } from "@/lib/upload/upload-job-error";

export type UploadJobStatus =
  | "queued"
  | "uploading"
  | "pausing"
  | "paused"
  | "cancelling"
  | "cancelled"
  | "success"
  | "failed";

export type UploadJobIndexingStatus =
  | "idle"
  | "pending"
  | "complete"
  | "failed"
  | "skipped";

export type UploadJobSnapshot = {
  id: string;
  file: File;
  status: UploadJobStatus;
  progress: number;
  uploadId: string | null;
  fileId: string | null;
  completedChunkIndexes: number[];
  error: string | null;
  indexingStatus: UploadJobIndexingStatus;
  indexingError: string | null;
};

export type UploadJobListener = (snapshot: UploadJobSnapshot) => void;

export class UploadJob {
  private id: string;
  private file: File;
  private status: UploadJobStatus;
  private progress: number;
  private uploadId: string | null;
  private fileId: string | null;
  private completedChunkIndexes: Set<number>;
  private totalChunks: number | null;
  private error: string | null;
  private indexingStatus: UploadJobIndexingStatus;
  private indexingError: string | null;
  private listeners: Set<UploadJobListener>;

  constructor(file: File) {
    this.id = crypto.randomUUID();
    this.file = file;
    this.status = "queued";
    this.progress = 0;
    this.uploadId = null;
    this.fileId = null;
    this.completedChunkIndexes = new Set<number>();
    this.totalChunks = null;
    this.error = null;
    this.indexingStatus = "idle";
    this.indexingError = null;
    this.listeners = new Set<UploadJobListener>();
  }

  public subscribe(listener: UploadJobListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentSnapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(currentSnapshot);
    }
  }

  getSnapshot(): UploadJobSnapshot {
    return {
      id: this.id,
      file: this.file,
      status: this.status,
      progress: this.progress,
      uploadId: this.uploadId,
      fileId: this.fileId,
      completedChunkIndexes: [...this.completedChunkIndexes].sort((a, b) => a - b),
      error: this.error,
      indexingStatus: this.indexingStatus,
      indexingError: this.indexingError,
    };
  }

  pause() {
    if (this.status === "uploading") {
      this.status = "pausing";
      this.notify();
    }
  }

  cancel() {
    if (this.status === "uploading" || this.status === "pausing") {
      this.status = "cancelling";
      this.notify();
    } else if (this.status === "queued") {
      this.status = "cancelled";
      this.notify();
    }
  }

  resume() {
    if (this.status === "paused" || this.status === "failed") {
      this.status = "queued";
      this.error = null;
      this.indexingStatus = "idle";
      this.indexingError = null;
      this.notify();
    }
  }

  async start() {
    if (this.status !== "queued") {
      return;
    }

    this.error = null;
    this.indexingStatus = "idle";
    this.indexingError = null;
    this.status = "uploading";
    this.notify();

    try {
      this.assertClientFileTypeAllowed();
      const chunksWithMetaData = sliceFilesWithMetaData(this.file);

      await this.initUpload();
      await this.getStatus();

      //check if the job is already completed or failed
      if (isTerminalStatus(this.status)) {
        return;
      }

      for (const chunk of chunksWithMetaData) {
        if (this.shouldStopAfterCurrentChunk()) {
          this.finalizeRequestedStop();
          return;
        }

        if (!this.completedChunkIndexes.has(chunk.index)) {
          await this.uploadChunk(chunk.blob, chunk.index);
        }
      }

      if (this.shouldStopAfterCurrentChunk()) {
        this.finalizeRequestedStop();
        return;
      }

      await this.uploadComplete();
    } catch (error) {
      this.error = getUploadJobErrorMessage(error);

      //if not canceled or paused then change to failed due to error
      if (!isStoppedStatus(this.status)) {
        this.status = "failed";
      }

      this.notify();
      throw error;
    }
  }

  private async initUpload() {
    const initResponse = await fetch("/api/upload/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: this.file.name,
        fileSize: this.file.size,
        fileType: this.file.type,
      }),
    });

    if (!initResponse.ok) {
      const errorMessage = await getUploadErrorMessageFromResponse(
        initResponse,
        "Failed to initialize upload",
      );

      throw createUploadJobErrorFromHttp({
        stage: "init",
        status: initResponse.status,
        message: errorMessage,
      });
    }

    const parsedJson: InitUploadResponse = await initResponse.json();
    this.uploadId = parsedJson.uploadId;
    this.fileId = parsedJson.fileId;
    this.totalChunks = parsedJson.totalChunks;
    this.notify();
  }

  private async getStatus() {
    const currentUploadId = this.requireUploadId();

    const statusResponse = await fetch(`/api/upload/status?uploadId=${currentUploadId}`, {
      method: "GET",
    });

    if (!statusResponse.ok) {
      const errorMessage = await getUploadErrorMessageFromResponse(
        statusResponse,
        "Failed to get status",
      );

      throw createUploadJobErrorFromHttp({
        message: errorMessage,
        status: statusResponse.status,
        stage: "status",
      });
    }

    const {
      completedChunkIndexes,
      fileId,
      totalChunks,
      status,
      uploadId,
    }: UploadStatusResponse = await statusResponse.json();

    this.completedChunkIndexes = new Set<number>(completedChunkIndexes);
    this.totalChunks = totalChunks;
    this.fileId = fileId;
    this.uploadId = uploadId;
    this.status = mapApiStatusToJobStatus(status);
    this.syncProgress();
    this.notify();
  }

  private async uploadChunk(chunk: Blob, chunkIndex: number) {
    const uploadId = this.requireUploadId();
    let attempt = 0;

    while (attempt <= MAX_CHUNK_UPLOAD_RETRIES) {
      try {
        const uploadResponse = await fetch("/api/upload/chunk", {
          method: "POST",
          body: chunk,
          headers: {
            "x-upload-id": uploadId,
            "x-chunk-index": String(chunkIndex),
          },
        });

        if (uploadResponse.status === 409) {
          this.updateCompletedChunkIndexAndProgress(chunkIndex);
          return;
        }

        if (!uploadResponse.ok) {
          const errorMessage = await getUploadErrorMessageFromResponse(
            uploadResponse,
            `Failed to upload chunk with chunkIndex: ${chunkIndex}`,
          );

          const uploadError = createUploadJobErrorFromHttp({
            stage: "chunk",
            status: uploadResponse.status,
            message: errorMessage,
          });

          if (!shouldRetryChunkUpload(uploadError) || attempt >= MAX_CHUNK_UPLOAD_RETRIES) {
            throw uploadError;
          }

          await sleep(getChunkRetryDelayMs(attempt, uploadError.status));
          attempt += 1;
          continue;
        }

        const parsedJson: UploadChunkResponse = await uploadResponse.json();
        this.updateCompletedChunkIndexAndProgress(parsedJson.chunkIndex);
        return;
      } catch (error) {
        const normalizedError = normalizeChunkUploadError(error, chunkIndex);

        if (!shouldRetryChunkUpload(normalizedError) || attempt >= MAX_CHUNK_UPLOAD_RETRIES) {
          throw normalizedError;
        }

        await sleep(getChunkRetryDelayMs(attempt, normalizedError.status));
        attempt += 1;
      }
    }
  }

  private async uploadComplete() {
    const uploadId = this.requireUploadId();

    const completedResponse = await fetch("/api/upload/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uploadId }),
    });

    if (!completedResponse.ok) {
      const errorMessage = await getUploadErrorMessageFromResponse(
        completedResponse,
        "Failed to mark upload as completed",
      );

      throw createUploadJobErrorFromHttp({
        message: errorMessage,
        status: completedResponse.status,
        stage: "complete",
      });
    }

    await completedResponse.json() as CompleteUploadResponse;
    this.progress = 100;
    this.status = "success";
    this.notify();
    void this.triggerSemanticIndexing();
  }

  private async triggerSemanticIndexing() {
    const indexingRequest = getSemanticIndexingRequest(this.file, this.fileId);

    if (!indexingRequest) {
      this.indexingStatus = "skipped";
      this.indexingError = null;
      this.notify();
      return;
    }

    this.indexingStatus = "pending";
    this.indexingError = null;
    this.notify();

    try {
      // Phase 4 only wires the client trigger. The embeddings API may not
      // exist yet, so any failure here must stay isolated from upload success.
      await fetch("/api/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(indexingRequest),
      });

      this.indexingStatus = "complete";
      this.indexingError = null;
      this.notify();
    } catch (error) {
      this.indexingStatus = "failed";
      this.indexingError = getUploadJobErrorMessage(error);
      this.notify();
    }
  }

  private updateCompletedChunkIndexAndProgress(chunkIndex: number) {
    if (this.totalChunks == null) {
      return;
    }

    this.completedChunkIndexes.add(chunkIndex);
    this.syncProgress();
    this.notify();
  }

  private syncProgress() {
    if (this.totalChunks == null || this.totalChunks <= 0) {
      return;
    }

    this.progress = (this.completedChunkIndexes.size / this.totalChunks) * 100;
  }

  private shouldStopAfterCurrentChunk() {
    return this.status === "pausing" || this.status === "cancelling";
  }

  private finalizeRequestedStop() {
    if (this.status === "pausing") {
      this.status = "paused";
      this.notify();
      return;
    }

    if (this.status === "cancelling") {
      this.status = "cancelled";
      this.notify();
    }
  }

  private requireUploadId() {
    if (!this.uploadId) {
      throw new UploadJobError({
        message: "Missing upload id when trying to continue the upload",
        code: "CHUNK_FAILED",
        stage: "chunk",
      });
    }

    return this.uploadId;
  }

  private assertClientFileTypeAllowed() {
    if (!this.file.type || isAllowedFileType(this.file.type)) {
      return;
    }

    throw new UploadJobError({
      message: `File type ${this.file.type} is not allowed`,
      code: "UNSUPPORTED_TYPE",
      stage: "unknown",
      status: 415,
    });
  }
}

function mapApiStatusToJobStatus(status: UploadStatusResponse["status"]): UploadJobStatus {
  switch (status) {
    case "uploading":
      return "uploading";
    case "completed":
      return "success";
    case "failed":
      return "failed";
    case "expired":
      return "failed";
  }
}

function isTerminalStatus(status: UploadJobStatus) {
  return status === "success" || status === "failed";
}

function isStoppedStatus(status: UploadJobStatus) {
  return status === "paused" || status === "cancelled";
}

function getUploadJobErrorMessage(error: unknown) {
  if (error instanceof UploadJobError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Upload failed";
}

function shouldRetryChunkUpload(error: UploadJobError) {
  return (
    error.code === "NETWORK_ERROR" ||
    error.code === "RATE_LIMITED" ||
    error.code === "SERVER_ERROR"
  );
}

function normalizeChunkUploadError(error: unknown, chunkIndex: number) {
  if (error instanceof UploadJobError) {
    return error;
  }

  if (error instanceof Error) {
    return new UploadJobError({
      message: error.message,
      code: "NETWORK_ERROR",
      stage: "chunk",
      cause: error,
    });
  }

  return new UploadJobError({
    message: `Failed to upload chunk with chunkIndex: ${chunkIndex}`,
    code: "CHUNK_FAILED",
    stage: "chunk",
    cause: error,
  });
}

function getChunkRetryDelayMs(attempt: number, status: number | null) {
  const baseDelay = status === 429
    ? RATE_LIMIT_RETRY_BASE_DELAY_MS
    : CHUNK_RETRY_BASE_DELAY_MS;
  const exponentialDelay = baseDelay * (2 ** attempt);
  const jitter = Math.floor(Math.random() * MAX_RETRY_JITTER_MS);

  return exponentialDelay + jitter;
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function getUploadErrorMessageFromResponse(
  response: Response,
  fallbackMessage: string,
) {
  const responseClone = response.clone();

  try {
    const payload = await response.json() as { message?: unknown };

    if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message;
    }
  } catch {
    // Fall through and try plain text next.
  }

  try {
    const responseText = await responseClone.text();

    if (responseText.trim().length > 0) {
      return responseText;
    }
  } catch {
    // Fall through to the default error message when the error response
    // cannot be parsed.
  }

  return fallbackMessage;
}

function getSemanticIndexingRequest(file: File, fileId: string | null) {
  if (!fileId) {
    return null;
  }

  if (file.type === "application/pdf") {
    if (file.size > 10 * 1024 * 1024) {
      return null;
    }

    return {
      fileId,
      modality: "pdf" as const,
    };
  }

  if (isEligibleImageMimeType(file.type)) {
    return {
      fileId,
      modality: "image" as const,
    };
  }

  return null;
}

function isEligibleImageMimeType(mimeType: string) {
  return new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
  ]).has(mimeType);
}
