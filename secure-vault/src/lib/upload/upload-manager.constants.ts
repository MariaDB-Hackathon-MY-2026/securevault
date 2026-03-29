import type { UploadJobStatus } from "@/lib/upload/upload-job";

export const MAX_CONCURRENT_UPLOADS = 3;

export const ACTIVE_UPLOAD_STATUSES = new Set<UploadJobStatus>([
  "uploading",
  "cancelling",
  "pausing",
]);

export const REMOVABLE_UPLOAD_STATUSES = new Set<UploadJobStatus>([
  "success",
  "failed",
  "cancelled",
]);
