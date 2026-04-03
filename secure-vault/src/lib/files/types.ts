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

export type StorageUsage = {
  fileCount: number;
  totalBytes: number;
};
