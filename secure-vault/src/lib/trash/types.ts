export type TrashFileItem = {
  deletedAt: string;
  folderId: string | null;
  id: string;
  kind: "file";
  mimeType: string;
  name: string;
  purgeAt: string;
  size: number;
};

export type TrashFolderItem = {
  deletedAt: string;
  descendantFileCount: number;
  descendantFolderCount: number;
  id: string;
  kind: "folder";
  name: string;
  parentId: string | null;
  purgeAt: string;
  totalBytes: number;
};

export type TrashItem = TrashFileItem | TrashFolderItem;

export type TrashSummary = {
  rootFileCount: number;
  rootFolderCount: number;
  totalRootItemCount: number;
};

export type TrashPageData = {
  items: TrashItem[];
  summary: TrashSummary;
};

export type TrashPurgeResult = {
  deletedFiles: number;
  deletedFolders: number;
  reclaimedBytes: number;
};

export type ExpiredUploadCleanupResult = {
  deletedFiles: number;
  expiredSessions: number;
};
