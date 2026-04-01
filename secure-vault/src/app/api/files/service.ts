import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { MariadbConnection } from "@/lib/db";
import { files, folders } from "@/lib/db/schema";
import { sanitizeFilename } from "@/lib/crypto";
import type { FileListItem, FolderListItem, StorageUsage } from "@/lib/files/types";

function mapFileListItem(file: {
  createdAt: Date;
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
        eq(files.id, fileId),
        eq(files.user_id, userId),
        isNull(files.deleted_at),
      ),
    )
    .limit(1);

  return result[0] ? mapFileListItem(result[0]) : null;
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
    throw new Error("File not found");
  }

  const updatedFile = await getFileById(userId, fileId);
  if (!updatedFile) {
    throw new Error("File not found");
  }

  return updatedFile;
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
    throw new Error("File not found");
  }

  return { deletedAt: deletedAt.toISOString(), fileId };
}

export async function bulkSoftDelete(userId: string, fileIds: string[]) {
  if (fileIds.length === 0) {
    return { affectedCount: 0 };
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

export async function listFoldersForUser(userId: string): Promise<FolderListItem[]> {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({
      createdAt: folders.created_at,
      id: folders.id,
      name: folders.name,
      parentId: folders.parent_id,
    })
    .from(folders)
    .where(and(eq(folders.user_id, userId), isNull(folders.deleted_at)))
    .orderBy(folders.name);

  return result.map(mapFolderListItem);
}

export async function createFolder(
  userId: string,
  name: string,
  parentId: string | null,
): Promise<FolderListItem> {
  const db = MariadbConnection.getConnection();
  const sanitizedName = sanitizeFilename(name);
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
        isNull(files.deleted_at),
      ),
    );

  return {
    fileCount: result[0]?.fileCount ?? 0,
    totalBytes: result[0]?.totalBytes ?? 0,
  };
}
