import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { MariadbConnection } from "@/lib/db";
import { files, folders } from "@/lib/db/schema";
import { sanitizeFilename } from "@/lib/crypto";
import type { FileListItem, FolderListItem, StorageUsage } from "@/lib/files/types";
import type {
  ExpiredUploadCleanupResult,
  TrashPageData,
  TrashPurgeResult,
  TrashSummary,
} from "@/lib/trash/types";
import { collectFolderSubtreeIds } from "@/lib/trash/trash-utils";
import {
  cleanupExpiredUploads as cleanupExpiredUploadsInternal,
  emptyTrash as emptyTrashInternal,
  getTrashSummary as getTrashSummaryInternal,
  listTrashForUser as listTrashForUserInternal,
  permanentlyDeleteFile as permanentlyDeleteFileInternal,
  permanentlyDeleteFolder as permanentlyDeleteFolderInternal,
  purgeExpiredTrash as purgeExpiredTrashInternal,
  restoreFile as restoreFileInternal,
  restoreFolder as restoreFolderInternal,
} from "@/app/api/files/trash-service";

export const MAX_BULK_FILE_IDS = 500;
const MAX_NAME_LENGTH = 255;

function mapFileListItem(file: {
  createdAt: Date;
  deletedAt?: Date | null;
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  size: number;
  updatedAt: Date;
}): FileListItem {
  return {
    createdAt: new Date(file.createdAt).toISOString(),
    folderId: file.folderId,
    id: file.id,
    mimeType: file.mimeType,
    name: file.name,
    size: file.size,
    updatedAt: new Date(file.updatedAt).toISOString(),
  };
}

type ScopedFileRecord = {
  createdAt: Date;
  deletedAt: Date | null;
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  size: number;
  updatedAt: Date;
};

async function getScopedFileRecord(
  userId: string,
  fileId: string,
  options?: { includeDeleted?: boolean },
): Promise<ScopedFileRecord | null> {
  const db = MariadbConnection.getConnection();
  const includeDeleted = options?.includeDeleted ?? false;
  const result = await db
    .select({
      createdAt: files.created_at,
      deletedAt: files.deleted_at,
      folderId: files.folder_id,
      id: files.id,
      mimeType: files.mime_type,
      name: files.name,
      size: files.size,
      updatedAt: files.updated_at,
    })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.user_id, userId),
        ...(includeDeleted ? [] : [isNull(files.deleted_at)]),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

function mapFolderListItem(folder: {
  createdAt: Date;
  id: string;
  name: string;
  parentId: string | null;
}): FolderListItem {
  return {
    createdAt: new Date(folder.createdAt).toISOString(),
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
  };
}

type ScopedFolderRecord = {
  createdAt: Date;
  deletedAt: Date | null;
  id: string;
  name: string;
  parentId: string | null;
};

async function getScopedFolderRecord(
  userId: string,
  folderId: string,
  options?: { includeDeleted?: boolean },
): Promise<ScopedFolderRecord | null> {
  const db = MariadbConnection.getConnection();
  const includeDeleted = options?.includeDeleted ?? false;
  const result = await db
    .select({
      createdAt: folders.created_at,
      deletedAt: folders.deleted_at,
      id: folders.id,
      name: folders.name,
      parentId: folders.parent_id,
    })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.user_id, userId),
        ...(includeDeleted ? [] : [isNull(folders.deleted_at)]),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

async function listScopedFolderRecords(
  userId: string,
  options?: { includeDeleted?: boolean },
): Promise<ScopedFolderRecord[]> {
  const db = MariadbConnection.getConnection();
  const includeDeleted = options?.includeDeleted ?? false;

  return db
    .select({
      createdAt: folders.created_at,
      deletedAt: folders.deleted_at,
      id: folders.id,
      name: folders.name,
      parentId: folders.parent_id,
    })
    .from(folders)
    .where(
      and(
        eq(folders.user_id, userId),
        ...(includeDeleted ? [] : [isNull(folders.deleted_at)]),
      ),
    );
}

async function assertFolderOwnership(userId: string, folderId: string) {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.user_id, userId),
        isNull(folders.deleted_at),
      ),
    )
    .limit(1);

  if (result.length === 0) {
    throw new Error("Folder not found");
  }
}

function getAffectedCount(result: unknown) {
  if (typeof result !== "object" || !result) {
    return 0;
  }

  const maybeResult = result as {
    affectedRows?: number;
    rowsAffected?: number;
  };

  return maybeResult.rowsAffected ?? maybeResult.affectedRows ?? 0;
}

function assertValidSanitizedName(name: string, label: string) {
  if (!name) {
    throw new Error(`${label} is required`);
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw new Error("Name too long");
  }

  return name;
}

function assertNoCircularFolderMove(
  folderId: string,
  targetParentId: string | null,
  folderMap: Map<string, Pick<ScopedFolderRecord, "id" | "parentId">>,
) {
  if (!targetParentId) {
    return;
  }

  const visitedFolderIds = new Set<string>();
  let currentFolderId: string | null = targetParentId;

  while (currentFolderId) {
    if (currentFolderId === folderId) {
      throw new Error("Cannot move a folder into itself or one of its descendants");
    }

    if (visitedFolderIds.has(currentFolderId)) {
      break;
    }

    visitedFolderIds.add(currentFolderId);
    currentFolderId = folderMap.get(currentFolderId)?.parentId ?? null;
  }
}

export async function listReadyFilesForUser(userId: string): Promise<FileListItem[]> {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({
      createdAt: files.created_at,
      folderId: files.folder_id,
      id: files.id,
      mimeType: files.mime_type,
      name: files.name,
      size: files.size,
      updatedAt: files.updated_at,
    })
    .from(files)
    .where(
      and(
        eq(files.user_id, userId),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
      ),
    )
    .orderBy(desc(files.updated_at));

  return result.map(mapFileListItem);
}

export async function getFileById(userId: string, fileId: string): Promise<FileListItem | null> {
  const file = await getScopedFileRecord(userId, fileId);
  return file ? mapFileListItem(file) : null;
}

export async function renameFile(userId: string, fileId: string, newName: string) {
  const db = MariadbConnection.getConnection();
  const sanitizedName = sanitizeFilename(newName);

  const result = await db
    .update(files)
    .set({ name: sanitizedName })
    .where(
      and(
        eq(files.id, fileId),
        eq(files.user_id, userId),
        isNull(files.deleted_at),
      ),
    );

  if (getAffectedCount(result) === 0) {
    const existingFile = await getFileById(userId, fileId);

    if (existingFile?.name === sanitizedName) {
      return existingFile;
    }

    throw new Error("File not found");
  }

  const updatedFile = await getFileById(userId, fileId);
  if (!updatedFile) {
    throw new Error("File not found");
  }

  return updatedFile;
}

export async function renameFolder(userId: string, folderId: string, newName: string) {
  const db = MariadbConnection.getConnection();
  const sanitizedName = assertValidSanitizedName(
    sanitizeFilename(newName, { fallback: "", truncate: false }),
    "Folder name",
  );
  const existingFolder = await getScopedFolderRecord(userId, folderId);

  if (!existingFolder || existingFolder.deletedAt) {
    throw new Error("Folder not found");
  }

  const result = await db
    .update(folders)
    .set({ name: sanitizedName })
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.user_id, userId),
        isNull(folders.deleted_at),
      ),
    );

  if (getAffectedCount(result) === 0) {
    const updatedFolder = await getScopedFolderRecord(userId, folderId);

    if (updatedFolder?.name === sanitizedName) {
      return mapFolderListItem(updatedFolder);
    }

    throw new Error("Folder not found");
  }

  const updatedFolder = await getScopedFolderRecord(userId, folderId);
  if (!updatedFolder) {
    throw new Error("Folder not found");
  }

  return mapFolderListItem(updatedFolder);
}

export async function moveFile(
  userId: string,
  fileId: string,
  targetFolderId: string | null,
) {
  const db = MariadbConnection.getConnection();

  if (targetFolderId) {
    await assertFolderOwnership(userId, targetFolderId);
  }

  const result = await db
    .update(files)
    .set({ folder_id: targetFolderId })
    .where(
      and(
        eq(files.id, fileId),
        eq(files.user_id, userId),
        isNull(files.deleted_at),
      ),
    );

  if (getAffectedCount(result) === 0) {
    const existingFile = await getFileById(userId, fileId);

    if (existingFile?.folderId === targetFolderId) {
      return existingFile;
    }

    throw new Error("File not found");
  }

  const updatedFile = await getFileById(userId, fileId);
  if (!updatedFile) {
    throw new Error("File not found");
  }

  return updatedFile;
}

export async function softDeleteFile(userId: string, fileId: string) {
  const db = MariadbConnection.getConnection();
  const deletedAt = new Date();
  const result = await db
    .update(files)
    .set({ deleted_at: deletedAt })
    .where(
      and(
        eq(files.id, fileId),
        eq(files.user_id, userId),
        isNull(files.deleted_at),
      ),
    );

  if (getAffectedCount(result) === 0) {
    const existingFile = await getScopedFileRecord(userId, fileId, { includeDeleted: true });

    if (existingFile?.deletedAt) {
      return { deletedAt: existingFile.deletedAt.toISOString(), fileId };
    }

    throw new Error("File not found");
  }

  return { deletedAt: deletedAt.toISOString(), fileId };
}

export async function softDeleteFolder(userId: string, folderId: string) {
  const db = MariadbConnection.getConnection();
  // We include soft-deleted rows so subtree discovery stays correct even when
  // part of the family tree was deleted earlier. This is a deliberate
  // read-into-memory trade-off until we move the traversal into SQL.
  const scopedFolders = await listScopedFolderRecords(userId, { includeDeleted: true });
  const folderMap = new Map(scopedFolders.map((folder) => [folder.id, folder]));
  const targetFolder = folderMap.get(folderId);

  if (!targetFolder) {
    throw new Error("Folder not found");
  }

  if (targetFolder.deletedAt) {
    return { deletedFiles: 0, deletedFolders: 0 };
  }

  const subtreeFolderIds = collectFolderSubtreeIds(folderId, scopedFolders);
  const deletedAt = new Date();
  return db.transaction(async (tx) => {
    const folderDeleteResult = await tx
      .update(folders)
      .set({ deleted_at: deletedAt })
      .where(
        and(
          eq(folders.user_id, userId),
          inArray(folders.id, subtreeFolderIds),
          isNull(folders.deleted_at),
        ),
      );
    const fileDeleteResult = await tx
      .update(files)
      .set({ deleted_at: deletedAt })
      .where(
        and(
          eq(files.user_id, userId),
          inArray(files.folder_id, subtreeFolderIds),
          isNull(files.deleted_at),
        ),
      );

    return {
      deletedFiles: getAffectedCount(fileDeleteResult),
      deletedFolders: getAffectedCount(folderDeleteResult),
    };
  });
}

export async function bulkSoftDelete(userId: string, fileIds: string[]) {
  if (fileIds.length === 0) {
    return { affectedCount: 0 };
  }

  if (fileIds.length > MAX_BULK_FILE_IDS) {
    throw new Error(`Cannot bulk-delete more than ${MAX_BULK_FILE_IDS} files at once`);
  }

  const db = MariadbConnection.getConnection();
  const result = await db
    .update(files)
    .set({ deleted_at: new Date() })
    .where(
      and(
        eq(files.user_id, userId),
        inArray(files.id, fileIds),
        isNull(files.deleted_at),
      ),
    );

  return { affectedCount: getAffectedCount(result) };
}

export async function bulkMoveFiles(
  userId: string,
  fileIds: string[],
  targetFolderId: string | null,
) {
  if (fileIds.length === 0) {
    return { affectedCount: 0 };
  }

  if (fileIds.length > MAX_BULK_FILE_IDS) {
    throw new Error(`Cannot bulk-move more than ${MAX_BULK_FILE_IDS} files at once`);
  }

  const db = MariadbConnection.getConnection();

  if (targetFolderId) {
    await assertFolderOwnership(userId, targetFolderId);
  }

  const result = await db
    .update(files)
    .set({ folder_id: targetFolderId })
    .where(
      and(
        eq(files.user_id, userId),
        inArray(files.id, fileIds),
        isNull(files.deleted_at),
      ),
    );

  return { affectedCount: getAffectedCount(result) };
}

export async function moveFolder(
  userId: string,
  folderId: string,
  targetParentId: string | null,
) {
  const db = MariadbConnection.getConnection();
  const existingFolder = await getScopedFolderRecord(userId, folderId);

  if (!existingFolder || existingFolder.deletedAt) {
    throw new Error("Folder not found");
  }

  if (targetParentId) {
    await assertFolderOwnership(userId, targetParentId);
    const scopedFolders = await listScopedFolderRecords(userId);
    const folderMap = new Map(scopedFolders.map((folder) => [folder.id, folder]));
    assertNoCircularFolderMove(folderId, targetParentId, folderMap);
  }

  const result = await db
    .update(folders)
    .set({ parent_id: targetParentId })
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.user_id, userId),
        isNull(folders.deleted_at),
      ),
    );

  if (getAffectedCount(result) === 0) {
    if (existingFolder.parentId === targetParentId) {
      return mapFolderListItem(existingFolder);
    }

    throw new Error("Folder not found");
  }

  const updatedFolder = await getScopedFolderRecord(userId, folderId);
  if (!updatedFolder) {
    throw new Error("Folder not found");
  }

  return mapFolderListItem(updatedFolder);
}

export async function listFoldersForUser(userId: string): Promise<FolderListItem[]> {
  const result = await listScopedFolderRecords(userId);
  return result
    .map(mapFolderListItem)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createFolder(
  userId: string,
  name: string,
  parentId: string | null,
): Promise<FolderListItem> {
  const db = MariadbConnection.getConnection();
  const sanitizedName = assertValidSanitizedName(
    sanitizeFilename(name, { fallback: "", truncate: false }),
    "Folder name",
  );
  const createdAt = new Date();
  const folderId = nanoid();

  if (parentId) {
    await assertFolderOwnership(userId, parentId);
  }

  await db.insert(folders).values({
    created_at: createdAt,
    id: folderId,
    name: sanitizedName,
    parent_id: parentId,
    user_id: userId,
  });

  return {
    createdAt: createdAt.toISOString(),
    id: folderId,
    name: sanitizedName,
    parentId,
  };
}

export async function getStorageUsage(userId: string): Promise<StorageUsage> {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({
      fileCount: sql<number>`cast(count(*) as signed)`,
      totalBytes: sql<number>`coalesce(sum(${files.size}), 0)`,
    })
    .from(files)
    .where(
      and(
        eq(files.user_id, userId),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
      ),
    );

  return {
    fileCount: result[0]?.fileCount ?? 0,
    totalBytes: result[0]?.totalBytes ?? 0,
  };
}

export async function listTrashForUser(userId: string): Promise<TrashPageData> {
  return listTrashForUserInternal(userId);
}

export async function getTrashSummary(userId: string): Promise<TrashSummary> {
  return getTrashSummaryInternal(userId);
}

export async function restoreFile(userId: string, fileId: string): Promise<FileListItem> {
  return restoreFileInternal(userId, fileId);
}

export async function restoreFolder(userId: string, folderId: string) {
  return restoreFolderInternal(userId, folderId);
}

export async function permanentlyDeleteFile(
  userId: string,
  fileId: string,
): Promise<TrashPurgeResult> {
  return permanentlyDeleteFileInternal(userId, fileId);
}

export async function permanentlyDeleteFolder(
  userId: string,
  folderId: string,
): Promise<TrashPurgeResult> {
  return permanentlyDeleteFolderInternal(userId, folderId);
}

export async function emptyTrash(userId: string): Promise<TrashPurgeResult> {
  return emptyTrashInternal(userId);
}

export async function purgeExpiredTrash(now = new Date()): Promise<TrashPurgeResult> {
  return purgeExpiredTrashInternal(now);
}

export async function cleanupExpiredUploads(
  now = new Date(),
): Promise<ExpiredUploadCleanupResult> {
  return cleanupExpiredUploadsInternal(now);
}
