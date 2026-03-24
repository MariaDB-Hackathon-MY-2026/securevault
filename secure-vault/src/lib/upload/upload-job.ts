import { sliceFilesWithMetaData } from "@/lib/storage/chunker";

import type { UploadChunkResponse } from "@/app/api/upload/chunk/types";
import type { CompleteUploadResponse } from "@/app/api/upload/complete/types";
import type { InitUploadResponse } from "@/app/api/upload/init/types";
import type { UploadStatusResponse } from "@/app/api/upload/status/types";
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

export type UploadJobSnapshot = {
  id: string;
  file: File;
  status: UploadJobStatus;
  progress: number;
  uploadId: string | null;
  fileId: string | null;
  completedChunkIndexes: number[];
  error: string | null;
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
    }
  }

  resume() {
    if (this.status === "paused" || this.status === "failed") {
      this.status = "queued";
      this.error = null;
      this.notify();
    }
  }

  async start() {
    if (this.status !== "queued") {
      return;
    }

    this.error = null;
    this.status = "uploading";
    this.notify();

    try {
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
      throw createUploadJobErrorFromHttp({
        stage: "init",
        status: initResponse.status,
        message: "Failed to initialize upload",
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
      throw createUploadJobErrorFromHttp({
        message: "Failed to get status",
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

    const uploadResponse = await fetch("/api/upload/chunk", {
      method: "POST",
      body: chunk,
      headers: {
        "x-upload-id": uploadId,
        "x-chunk-index": String(chunkIndex),
      },
    });

    if (!uploadResponse.ok) {
      throw createUploadJobErrorFromHttp({
        stage: "chunk",
        status: uploadResponse.status,
        message: `Failed to upload chunk with chunkIndex: ${chunkIndex}`,
      });
    }

    const parsedJson: UploadChunkResponse = await uploadResponse.json();
    this.updateCompletedChunkIndexAndProgress(parsedJson.chunkIndex);
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
      throw createUploadJobErrorFromHttp({
        message: "Failed to mark upload as completed",
        status: completedResponse.status,
        stage: "complete",
      });
    }

    await completedResponse.json() as CompleteUploadResponse;
    this.progress = 100;
    this.status = "success";
    this.notify();
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
