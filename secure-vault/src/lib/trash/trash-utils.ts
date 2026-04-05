import { TRASH_RETENTION_MS } from "@/lib/constants/trash";

type FolderNode = {
  deletedAt: Date | string | null;
  id: string;
  parentId: string | null;
};

type FileNode = {
  deletedAt: Date | string | null;
  folderId: string | null;
  size: number;
  status?: string;
};

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function collectFolderSubtreeIds(
  rootFolderId: string,
  folderRecords: Array<Pick<FolderNode, "id" | "parentId">>,
) {
  const childFolderIdsByParentId = new Map<string, string[]>();

  for (const folder of folderRecords) {
    if (!folder.parentId) {
      continue;
    }

    const childFolderIds = childFolderIdsByParentId.get(folder.parentId) ?? [];
    childFolderIds.push(folder.id);
    childFolderIdsByParentId.set(folder.parentId, childFolderIds);
  }

  const seenFolderIds = new Set<string>();
  const folderIdsToVisit = [rootFolderId];
  const subtreeFolderIds: string[] = [];

  while (folderIdsToVisit.length > 0) {
    const currentFolderId = folderIdsToVisit.pop();

    if (!currentFolderId || seenFolderIds.has(currentFolderId)) {
      continue;
    }

    seenFolderIds.add(currentFolderId);
    subtreeFolderIds.push(currentFolderId);

    for (const childFolderId of childFolderIdsByParentId.get(currentFolderId) ?? []) {
      folderIdsToVisit.push(childFolderId);
    }
  }

  return subtreeFolderIds;
}

export function isRootDeletedFolder(
  folder: Pick<FolderNode, "deletedAt" | "parentId">,
  folderMap: Map<string, Pick<FolderNode, "deletedAt">>,
) {
  if (!toDate(folder.deletedAt)) {
    return false;
  }

  if (!folder.parentId) {
    return true;
  }

  return !toDate(folderMap.get(folder.parentId)?.deletedAt ?? null);
}

export function isRootDeletedFile(
  file: Pick<FileNode, "deletedAt" | "folderId">,
  folderMap: Map<string, Pick<FolderNode, "deletedAt">>,
) {
  if (!toDate(file.deletedAt)) {
    return false;
  }

  if (!file.folderId) {
    return true;
  }

  return !toDate(folderMap.get(file.folderId)?.deletedAt ?? null);
}

export function getTrashPurgeAt(deletedAt: Date | string) {
  const parsedDeletedAt = toDate(deletedAt);

  if (!parsedDeletedAt) {
    throw new Error("Invalid deleted date");
  }

  return new Date(parsedDeletedAt.getTime() + TRASH_RETENTION_MS);
}

export function getTrashPurgeCutoff(now = new Date()) {
  return new Date(now.getTime() - TRASH_RETENTION_MS);
}

export function summarizeDeletedFolderSubtree(
  rootFolderId: string,
  folderRecords: Array<Pick<FolderNode, "deletedAt" | "id" | "parentId">>,
  deletedFiles: Array<Pick<FileNode, "deletedAt" | "folderId" | "size">>,
) {
  const subtreeFolderIds = collectFolderSubtreeIds(rootFolderId, folderRecords);
  const subtreeFolderIdSet = new Set(subtreeFolderIds);
  const descendantFolderCount = Math.max(subtreeFolderIds.length - 1, 0);
  const subtreeFiles = deletedFiles.filter(
    (file) =>
      toDate(file.deletedAt) &&
      file.folderId !== null &&
      subtreeFolderIdSet.has(file.folderId),
  );

  return {
    descendantFileCount: subtreeFiles.length,
    descendantFolderCount,
    totalBytes: subtreeFiles.reduce((total, file) => total + file.size, 0),
  };
}

export function calculateReclaimedBytes(files: Array<Pick<FileNode, "size" | "status">>) {
  return files.reduce((total, file) => {
    if (file.status !== "ready") {
      return total;
    }

    return total + file.size;
  }, 0);
}
