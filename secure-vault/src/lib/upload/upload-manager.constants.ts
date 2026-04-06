import { MAX_ACTIVE_UPLOADS_PER_USER } from "@/lib/constants/upload";
import type { UploadJobStatus } from "@/lib/upload/upload-job";

export const MAX_CONCURRENT_UPLOADS = MAX_ACTIVE_UPLOADS_PER_USER;

export const ACTIVE_UPLOAD_STATUSES = new Set<UploadJobStatus>([
  "uploading",
  "waiting_for_slot",
  "cancelling",
  "pausing",
]);

export const REMOVABLE_UPLOAD_STATUSES = new Set<UploadJobStatus>([
  "success",
  "failed",
  "cancelled",
]);
