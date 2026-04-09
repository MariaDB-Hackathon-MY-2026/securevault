export type FileListItem = {
  createdAt: string;
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  size: number;
  updatedAt: string;
};

export type FolderListItem = {
  createdAt: string;
  id: string;
  name: string;
  parentId: string | null;
};

export type FilesExplorerData = {
  files: FileListItem[];
  folders: FolderListItem[];
};

export type StorageCategory =
  | "documents"
  | "images"
  | "videos"
  | "audio"
  | "archives"
  | "other";

export type StorageBreakdownItem = {
  bytes: number;
  category: StorageCategory;
  fileCount: number;
  percentOfActiveBytes: number;
};

export type LargestFileItem = Pick<
  FileListItem,
  "folderId" | "id" | "mimeType" | "name" | "size" | "updatedAt"
>;

export type StorageDashboardData = {
  activeBytes: number;
  activeFileCount: number;
  breakdown: StorageBreakdownItem[];
  largestFiles: LargestFileItem[];
  quotaBytes: number;
  quotaUsedBytes: number;
  trashedBytes: number;
  trashedFileCount: number;
  usagePercent: number;
};

export type StorageUsage = {
  fileCount: number;
  totalBytes: number;
};
