import type { FileListItem, FolderListItem } from "@/lib/files/types";

export type FileSortKey = "name" | "size" | "updatedAt";
export type FileSortDirection = "asc" | "desc";
export type FileSortState = {
  direction: FileSortDirection;
  key: FileSortKey;
};
export type FilesViewMode = "grid" | "list";

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function formatFileSize(bytes: number) {
  if (bytes <= 0 || !Number.isFinite(bytes)) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatExplorerDate(isoDate: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

export function matchesExplorerFilter(name: string, filterValue: string) {
  if (!filterValue.trim()) {
    return true;
  }

  return name.toLowerCase().includes(filterValue.trim().toLowerCase());
}

export function getFolderPath(
  folderId: string | null,
  folderMap: Map<string, FolderListItem>,
) {
  if (!folderId) {
    return [];
  }

  const path: FolderListItem[] = [];
  const seen = new Set<string>();
  let currentId: string | null = folderId;

  while (currentId) {
    if (seen.has(currentId)) {
      break;
    }

    seen.add(currentId);
    const folder = folderMap.get(currentId);

    if (!folder) {
      break;
    }

    path.unshift(folder);
    currentId = folder.parentId;
  }

  return path;
}

export function getFolderDepth(
  folderId: string,
  folderMap: Map<string, FolderListItem>,
) {
  return getFolderPath(folderId, folderMap).length - 1;
}

export function getFolderSubtreeIds(
  folderId: string,
  folderMap: Map<string, FolderListItem>,
) {
  const childFolderIdsByParentId = new Map<string, string[]>();

  for (const folder of folderMap.values()) {
    if (!folder.parentId) {
      continue;
    }

    const childFolderIds = childFolderIdsByParentId.get(folder.parentId) ?? [];
    childFolderIds.push(folder.id);
    childFolderIdsByParentId.set(folder.parentId, childFolderIds);
  }

  const seenFolderIds = new Set<string>();
  const folderIdsToVisit = [folderId];
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

export function getFolderDescendantIds(
  folderId: string,
  folderMap: Map<string, FolderListItem>,
) {
  return getFolderSubtreeIds(folderId, folderMap).filter(
    (descendantFolderId) => descendantFolderId !== folderId,
  );
}

export function getNearestSurvivingFolderId(
  deletedFolderId: string,
  folderMap: Map<string, FolderListItem>,
  deletedFolderIds: Set<string>,
) {
  let currentFolderId = folderMap.get(deletedFolderId)?.parentId ?? null;
  const seenFolderIds = new Set<string>();

  while (currentFolderId) {
    if (seenFolderIds.has(currentFolderId)) {
      return null;
    }

    if (!deletedFolderIds.has(currentFolderId)) {
      return currentFolderId;
    }

    seenFolderIds.add(currentFolderId);
    currentFolderId = folderMap.get(currentFolderId)?.parentId ?? null;
  }

  return null;
}

function compareDates(leftIso: string, rightIso: string) {
  return new Date(leftIso).getTime() - new Date(rightIso).getTime();
}

export function compareFolders(
  left: FolderListItem,
  right: FolderListItem,
  sort: FileSortState,
) {
  if (sort.key === "updatedAt") {
    // Folders do not yet persist a dedicated updated timestamp, so we fall back
    // to creation time for date-based ordering until the schema adds one.
    const dateComparison = compareDates(left.createdAt, right.createdAt);
    return sort.direction === "asc" ? dateComparison : -dateComparison;
  }

  return collator.compare(left.name, right.name) * (sort.direction === "asc" ? 1 : -1);
}

export function compareFiles(
  left: FileListItem,
  right: FileListItem,
  sort: FileSortState,
) {
  if (sort.key === "size") {
    const sizeComparison = left.size - right.size;
    if (sizeComparison !== 0) {
      return sort.direction === "asc" ? sizeComparison : -sizeComparison;
    }
  }

  if (sort.key === "updatedAt") {
    const dateComparison = compareDates(left.updatedAt, right.updatedAt);
    if (dateComparison !== 0) {
      return sort.direction === "asc" ? dateComparison : -dateComparison;
    }
  }

  return collator.compare(left.name, right.name) * (sort.direction === "asc" ? 1 : -1);
}

export function getSortLabel(sort: FileSortState) {
  if (sort.key === "name" && sort.direction === "asc") {
    return "Name (A-Z)";
  }

  if (sort.key === "name" && sort.direction === "desc") {
    return "Name (Z-A)";
  }

  if (sort.key === "size" && sort.direction === "asc") {
    return "Size (smallest)";
  }

  if (sort.key === "size" && sort.direction === "desc") {
    return "Size (largest)";
  }

  if (sort.direction === "asc") {
    return "Modified (oldest)";
  }

  return "Modified (newest)";
}
