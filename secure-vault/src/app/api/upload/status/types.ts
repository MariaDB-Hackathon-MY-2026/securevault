export type UploadStatusResponse = {
  completedChunkIndexes: number[];
  fileId: string;
  status: "uploading" | "completed" | "failed" | "expired";
  totalChunks: number;
  uploadId: string;
};
