import { and, eq } from "drizzle-orm";

import type { CurrentUser } from "@/lib/auth/get-current-user";
import { MariadbConnection } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { classifyStorageCategory } from "@/lib/files/storage-category";
import type {
  LargestFileItem,
  StorageBreakdownItem,
  StorageCategory,
  StorageDashboardData,
} from "@/lib/files/types";

type StorageDashboardUser = Pick<CurrentUser, "id" | "storage_quota" | "storage_used">;

type StorageDashboardFileRow = {
  deletedAt: Date | null;
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  size: number;
  updatedAt: Date;
};

type StorageBucket = {
  bytes: number;
  fileCount: number;
};

const STORAGE_CATEGORIES: StorageCategory[] = [
  "documents",
  "images",
  "videos",
  "audio",
  "archives",
  "other",
];

export function createEmptyStorageDashboardData(): StorageDashboardData {
  return {
    activeBytes: 0,
    activeFileCount: 0,
    breakdown: STORAGE_CATEGORIES.map((category) => ({
      bytes: 0,
      category,
      fileCount: 0,
      percentOfActiveBytes: 0,
    })),
    largestFiles: [],
    quotaBytes: 0,
    quotaUsedBytes: 0,
    trashedBytes: 0,
    trashedFileCount: 0,
    usagePercent: 0,
  };
}

export function calculateUsagePercent(quotaUsedBytes: number, quotaBytes: number) {
  if (quotaBytes <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((quotaUsedBytes / quotaBytes) * 100)));
}

export function buildStorageDashboardData(input: {
  files: StorageDashboardFileRow[];
  quotaBytes: number;
  quotaUsedBytes: number;
}): StorageDashboardData {
  const activeFiles = input.files.filter((file) => file.deletedAt === null);
  const trashedFiles = input.files.filter((file) => file.deletedAt !== null);
  const categoryBuckets = new Map<StorageCategory, StorageBucket>(
    STORAGE_CATEGORIES.map((category) => [category, { bytes: 0, fileCount: 0 }]),
  );

  let activeBytes = 0;
  for (const file of activeFiles) {
    activeBytes += file.size;

    const category = classifyStorageCategory(file.mimeType);
    const bucket = categoryBuckets.get(category);
    if (!bucket) {
      continue;
    }

    bucket.bytes += file.size;
    bucket.fileCount += 1;
  }

  const trashedBytes = trashedFiles.reduce((totalBytes, file) => totalBytes + file.size, 0);

  const breakdown: StorageBreakdownItem[] = STORAGE_CATEGORIES.map((category) => {
    const bucket = categoryBuckets.get(category) ?? { bytes: 0, fileCount: 0 };

    return {
      bytes: bucket.bytes,
      category,
      fileCount: bucket.fileCount,
      percentOfActiveBytes:
        activeBytes > 0 ? Math.round((bucket.bytes / activeBytes) * 100) : 0,
    };
  });

  const largestFiles: LargestFileItem[] = [...activeFiles]
    .sort((left, right) => {
      if (right.size !== left.size) {
        return right.size - left.size;
      }

      if (right.updatedAt.getTime() !== left.updatedAt.getTime()) {
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      }

      return left.id.localeCompare(right.id);
    })
    .slice(0, 10)
    .map((file) => ({
      folderId: file.folderId,
      id: file.id,
      mimeType: file.mimeType,
      name: file.name,
      size: file.size,
      updatedAt: file.updatedAt.toISOString(),
    }));

  return {
    activeBytes,
    activeFileCount: activeFiles.length,
    breakdown,
    largestFiles,
    quotaBytes: input.quotaBytes,
    quotaUsedBytes: input.quotaUsedBytes,
    trashedBytes,
    trashedFileCount: trashedFiles.length,
    usagePercent: calculateUsagePercent(input.quotaUsedBytes, input.quotaBytes),
  };
}

export async function getStorageDashboardData(
  user: StorageDashboardUser,
): Promise<StorageDashboardData> {
  const db = MariadbConnection.getConnection();
  const readyFiles = await db
    .select({
      deletedAt: files.deleted_at,
      folderId: files.folder_id,
      id: files.id,
      mimeType: files.mime_type,
      name: files.name,
      size: files.size,
      updatedAt: files.updated_at,
    })
    .from(files)
    .where(and(eq(files.user_id, user.id), eq(files.status, "ready")));

  return buildStorageDashboardData({
    files: readyFiles,
    quotaBytes: user.storage_quota,
    quotaUsedBytes: user.storage_used,
  });
}
