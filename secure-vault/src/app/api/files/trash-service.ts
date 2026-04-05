import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { fileChunks, files, folders, shareLinks, uploadSessions, users } from "@/lib/db/schema";
import type { FileListItem } from "@/lib/files/types";
import {
  STALE_UPLOAD_CLEANUP_BATCH_SIZE,
  TRASH_PURGE_BATCH_SIZE,
} from "@/lib/constants/trash";
import type {
  ExpiredUploadCleanupResult,
  TrashFileItem,
  TrashFolderItem,
  TrashPageData,
  TrashPurgeResult,
  TrashSummary,
} from "@/lib/trash/types";
import {
  calculateReclaimedBytes,
  collectFolderSubtreeIds,
  getTrashPurgeAt,
  getTrashPurgeCutoff,
  isRootDeletedFile,
  isRootDeletedFolder,
  summarizeDeletedFolderSubtree,
} from "@/lib/trash/trash-utils";

type DbConnection = ReturnType<typeof MariadbConnection.getConnection>;
type DbTransaction = Parameters<Parameters<DbConnection["transaction"]>[0]>[0];

type ScopedFileRecord = {
  createdAt: Date;
  deletedAt: Date | null;
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  size: number;
  status: "failed" | "ready" | "uploading";
  thumbnailR2Key: string | null;
  updatedAt: Date;
  userId: string;
};

type ScopedFolderRecord = {
  createdAt: Date;
  deletedAt: Date | null;
  id: string;
  name: string;
  parentId: string | null;
  userId: string;
};

type TrashSummaryFolderRecord = Pick<ScopedFolderRecord, "deletedAt" | "id" | "parentId">;
type TrashSummaryFileRecord = Pick<ScopedFileRecord, "deletedAt" | "folderId">;

type PurgeManifestFile = {
  chunkKeys: string[];
  fileId: string;
  size: number;
  status: ScopedFileRecord["status"];
  thumbnailR2Key: string | null;
  userId: string;
};

type PurgeManifest = {
  fileIds: string[];
  files: PurgeManifestFile[];
  folderIds: string[];
  reclaimedBytes: number;
};

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

async function listScopedFolderRecords(
  userId: string,
  options?: { includeDeleted?: boolean },
) {
  const db = MariadbConnection.getConnection();
  const includeDeleted = options?.includeDeleted ?? false;

  return db
    .select({
      createdAt: folders.created_at,
      deletedAt: folders.deleted_at,
      id: folders.id,
      name: folders.name,
      parentId: folders.parent_id,
      userId: folders.user_id,
    })
    .from(folders)
    .where(
      and(
        eq(folders.user_id, userId),
        ...(includeDeleted ? [] : [isNull(folders.deleted_at)]),
      ),
    );
}

async function getScopedFolderRecord(
  userId: string,
  folderId: string,
  options?: { includeDeleted?: boolean },
) {
  const db = MariadbConnection.getConnection();
  const includeDeleted = options?.includeDeleted ?? false;
  const result = await db
    .select({
      createdAt: folders.created_at,
      deletedAt: folders.deleted_at,
      id: folders.id,
      name: folders.name,
      parentId: folders.parent_id,
      userId: folders.user_id,
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

async function getScopedFileRecord(
  userId: string,
  fileId: string,
  options?: { includeDeleted?: boolean },
) {
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
      status: files.status,
      thumbnailR2Key: files.thumbnail_r2_key,
      updatedAt: files.updated_at,
      userId: files.user_id,
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

async function listDeletedFilesForUser(userId: string) {
  const db = MariadbConnection.getConnection();

  return db
    .select({
      createdAt: files.created_at,
      deletedAt: files.deleted_at,
      folderId: files.folder_id,
      id: files.id,
      mimeType: files.mime_type,
      name: files.name,
      size: files.size,
      status: files.status,
      thumbnailR2Key: files.thumbnail_r2_key,
      updatedAt: files.updated_at,
      userId: files.user_id,
    })
    .from(files)
    .where(and(eq(files.user_id, userId), sql`${files.deleted_at} is not null`));
}

async function listDeletedFoldersForUser(userId: string) {
  const db = MariadbConnection.getConnection();

  return db
    .select({
      createdAt: folders.created_at,
      deletedAt: folders.deleted_at,
      id: folders.id,
      name: folders.name,
      parentId: folders.parent_id,
      userId: folders.user_id,
    })
    .from(folders)
    .where(and(eq(folders.user_id, userId), sql`${folders.deleted_at} is not null`));
}

async function listTrashSummaryFolderRecords(
  userId: string,
  options?: { includeDeleted?: boolean },
) {
  const db = MariadbConnection.getConnection();
  const includeDeleted = options?.includeDeleted ?? false;

  return db
    .select({
      deletedAt: folders.deleted_at,
      id: folders.id,
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

async function listTrashSummaryFilesForUser(userId: string) {
  const db = MariadbConnection.getConnection();

  return db
    .select({
      deletedAt: files.deleted_at,
      folderId: files.folder_id,
    })
    .from(files)
    .where(and(eq(files.user_id, userId), sql`${files.deleted_at} is not null`));
}

async function listTrashSummaryDeletedFoldersForUser(userId: string) {
  const db = MariadbConnection.getConnection();

  return db
    .select({
      deletedAt: folders.deleted_at,
      id: folders.id,
      parentId: folders.parent_id,
    })
    .from(folders)
    .where(and(eq(folders.user_id, userId), sql`${folders.deleted_at} is not null`));
}

function buildTrashSummaryFromItems(items: Array<TrashFileItem | TrashFolderItem>): TrashSummary {
  const rootFolderCount = items.filter((item) => item.kind === "folder").length;
  const rootFileCount = items.length - rootFolderCount;

  return {
    rootFileCount,
    rootFolderCount,
    totalRootItemCount: items.length,
  };
}

function buildTrashSummaryFromRows(options: {
  deletedFiles: TrashSummaryFileRecord[];
  deletedFolders: TrashSummaryFolderRecord[];
  folderRecords: TrashSummaryFolderRecord[];
}): TrashSummary {
  const folderMap = new Map(options.folderRecords.map((folder) => [folder.id, folder]));
  const rootFolderCount = options.deletedFolders.filter((folder) =>
    isRootDeletedFolder(folder, folderMap),
  ).length;
  const rootFileCount = options.deletedFiles.filter((file) =>
    isRootDeletedFile(file, folderMap),
  ).length;

  return {
    rootFileCount,
    rootFolderCount,
    totalRootItemCount: rootFileCount + rootFolderCount,
  };
}

async function buildTrashPageData(userId: string): Promise<TrashPageData> {
  const [folderRecords, deletedFiles, deletedFolders] = await Promise.all([
    listScopedFolderRecords(userId, { includeDeleted: true }),
    listDeletedFilesForUser(userId),
    listDeletedFoldersForUser(userId),
  ]);
  const folderMap = new Map(folderRecords.map((folder) => [folder.id, folder]));

  const rootFolderItems: TrashFolderItem[] = deletedFolders
    .filter((folder) => isRootDeletedFolder(folder, folderMap))
    .map((folder) => ({
      deletedAt: folder.deletedAt!.toISOString(),
      id: folder.id,
      kind: "folder",
      name: folder.name,
      parentId: folder.parentId,
      purgeAt: getTrashPurgeAt(folder.deletedAt!).toISOString(),
      ...summarizeDeletedFolderSubtree(folder.id, folderRecords, deletedFiles),
    }));

  const rootFileItems: TrashFileItem[] = deletedFiles
    .filter((file) => isRootDeletedFile(file, folderMap))
    .map((file) => ({
      deletedAt: file.deletedAt!.toISOString(),
      folderId: file.folderId,
      id: file.id,
      kind: "file",
      mimeType: file.mimeType,
      name: file.name,
      purgeAt: getTrashPurgeAt(file.deletedAt!).toISOString(),
      size: file.size,
    }));

  const items = [...rootFolderItems, ...rootFileItems].sort(
    (left, right) => new Date(right.deletedAt).getTime() - new Date(left.deletedAt).getTime(),
  );

  return {
    items,
    summary: buildTrashSummaryFromItems(items),
  };
}

async function buildTrashSummaryData(userId: string): Promise<TrashSummary> {
  const [folderRecords, deletedFiles, deletedFolders] = await Promise.all([
    listTrashSummaryFolderRecords(userId, { includeDeleted: true }),
    listTrashSummaryFilesForUser(userId),
    listTrashSummaryDeletedFoldersForUser(userId),
  ]);

  return buildTrashSummaryFromRows({
    deletedFiles,
    deletedFolders,
    folderRecords,
  });
}

async function loadFilesForPurge(
  db: DbConnection | DbTransaction,
  options: {
    deletedOnly?: boolean;
    fileIds?: string[];
    folderIds?: string[];
    userId?: string;
  },
) {
  const clauses = [];

  if (options.userId) {
    clauses.push(eq(files.user_id, options.userId));
  }

  if (options.deletedOnly ?? false) {
    clauses.push(sql`${files.deleted_at} is not null`);
  }

  if (options.fileIds && options.fileIds.length > 0 && options.folderIds && options.folderIds.length > 0) {
    clauses.push(or(inArray(files.id, options.fileIds), inArray(files.folder_id, options.folderIds))!);
  } else if (options.fileIds && options.fileIds.length > 0) {
    clauses.push(inArray(files.id, options.fileIds));
  } else if (options.folderIds && options.folderIds.length > 0) {
    clauses.push(inArray(files.folder_id, options.folderIds));
  } else {
    return [] as ScopedFileRecord[];
  }

  return db
    .select({
      createdAt: files.created_at,
      deletedAt: files.deleted_at,
      folderId: files.folder_id,
      id: files.id,
      mimeType: files.mime_type,
      name: files.name,
      size: files.size,
      status: files.status,
      thumbnailR2Key: files.thumbnail_r2_key,
      updatedAt: files.updated_at,
      userId: files.user_id,
    })
    .from(files)
    .where(and(...clauses));
}

async function buildPurgeManifest(
  db: DbConnection | DbTransaction,
  fileRows: ScopedFileRecord[],
  folderIds: string[] = [],
): Promise<PurgeManifest> {
  const fileIds = [...new Set(fileRows.map((file) => file.id))];

  if (fileIds.length === 0) {
    return {
      fileIds: [],
      files: [],
      folderIds,
      reclaimedBytes: 0,
    };
  }

  const chunkRows = await db
    .select({
      fileId: fileChunks.file_id,
      r2Key: fileChunks.r2_key,
    })
    .from(fileChunks)
    .where(inArray(fileChunks.file_id, fileIds));
  const chunkKeysByFileId = new Map<string, string[]>();

  for (const chunk of chunkRows) {
    const keys = chunkKeysByFileId.get(chunk.fileId) ?? [];
    keys.push(chunk.r2Key);
    chunkKeysByFileId.set(chunk.fileId, keys);
  }

  const manifestFiles = fileRows.map((file) => ({
    chunkKeys: chunkKeysByFileId.get(file.id) ?? [],
    fileId: file.id,
    size: file.size,
    status: file.status,
    thumbnailR2Key: file.thumbnailR2Key,
    userId: file.userId,
  }));

  return {
    fileIds,
    files: manifestFiles,
    folderIds,
    reclaimedBytes: calculateReclaimedBytes(manifestFiles),
  };
}

async function deleteShareLinksForTrashScope(
  tx: DbTransaction,
  scope: { fileIds: string[]; folderIds: string[] },
) {
  if (scope.fileIds.length > 0) {
    await tx.delete(shareLinks).where(inArray(shareLinks.file_id, scope.fileIds));
  }

  if (scope.folderIds.length > 0) {
    await tx.delete(shareLinks).where(inArray(shareLinks.folder_id, scope.folderIds));
  }
}

function isMissingObjectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    $metadata?: { httpStatusCode?: number };
    Code?: unknown;
    code?: unknown;
    name?: unknown;
  };

  return (
    maybeError.$metadata?.httpStatusCode === 404 ||
    maybeError.name === "NoSuchKey" ||
    maybeError.code === "NoSuchKey" ||
    maybeError.Code === "NoSuchKey" ||
    maybeError.name === "NotFound"
  );
}

async function deleteR2ObjectsFromManifest(manifest: PurgeManifest) {
  if (manifest.files.length === 0) {
    return;
  }

  const { deleteObject, listObjects } = await import("@/lib/storage/r2");

  for (const file of manifest.files) {
    const exactKeys = [...new Set([
      ...file.chunkKeys,
      ...(file.thumbnailR2Key ? [file.thumbnailR2Key] : []),
    ])];

    for (const key of exactKeys) {
      try {
        await deleteObject(key);
      } catch (error) {
        if (isMissingObjectError(error)) {
          continue;
        }

        console.error("Unexpected R2 delete failure during trash purge", {
          fileId: file.fileId,
          key,
          userId: file.userId,
        });
      }
    }

    const prefix = `${file.userId}/files/${file.fileId}`;

    try {
      const objects = await listObjects(prefix);
      const objectKeys =
        objects.Contents?.map((object) => object.Key).filter((key): key is string => Boolean(key)) ?? [];

      for (const key of objectKeys) {
        try {
          await deleteObject(key);
        } catch (error) {
          if (isMissingObjectError(error)) {
            continue;
          }

          console.error("Unexpected R2 prefix cleanup failure during trash purge", {
            fileId: file.fileId,
            key,
            prefix,
            userId: file.userId,
          });
        }
      }
    } catch {
      console.error("Unexpected R2 list failure during trash purge", {
        fileId: file.fileId,
        prefix,
        userId: file.userId,
      });
    }
  }
}

async function purgeDeletedScopeForUser(
  userId: string,
  scope: { fileIds?: string[]; folderIds?: string[] },
) {
  const normalizedFileIds = [...new Set(scope.fileIds ?? [])];
  const normalizedFolderIds = [...new Set(scope.folderIds ?? [])];

  if (normalizedFileIds.length === 0 && normalizedFolderIds.length === 0) {
    return {
      deletedFiles: 0,
      deletedFolders: 0,
      reclaimedBytes: 0,
    } satisfies TrashPurgeResult;
  }

  const db = MariadbConnection.getConnection();
  const transactionResult = await db.transaction(async (tx) => {
    const fileRows = await loadFilesForPurge(tx, {
      deletedOnly: true,
      fileIds: normalizedFileIds,
      folderIds: normalizedFolderIds,
      userId,
    });
    const manifest = await buildPurgeManifest(tx, fileRows, normalizedFolderIds);

    await deleteShareLinksForTrashScope(tx, {
      fileIds: manifest.fileIds,
      folderIds: normalizedFolderIds,
    });

    let deletedFiles = 0;
    let deletedFolders = 0;

    if (manifest.fileIds.length > 0) {
      const deletedFileResult = await tx
        .delete(files)
        .where(
          and(
            eq(files.user_id, userId),
            inArray(files.id, manifest.fileIds),
            sql`${files.deleted_at} is not null`,
          ),
        );
      deletedFiles = getAffectedCount(deletedFileResult);
    }

    if (normalizedFolderIds.length > 0) {
      const deletedFolderResult = await tx
        .delete(folders)
        .where(
          and(
            eq(folders.user_id, userId),
            inArray(folders.id, normalizedFolderIds),
            sql`${folders.deleted_at} is not null`,
          ),
        );
      deletedFolders = getAffectedCount(deletedFolderResult);
    }

    if (manifest.reclaimedBytes > 0) {
      await tx
        .update(users)
        .set({
          storage_used: sql`greatest(${users.storage_used} - ${manifest.reclaimedBytes}, 0)`,
        })
        .where(eq(users.id, userId));
    }

    return {
      manifest,
      result: {
        deletedFiles,
        deletedFolders,
        reclaimedBytes: manifest.reclaimedBytes,
      } satisfies TrashPurgeResult,
    };
  });

  await deleteR2ObjectsFromManifest(transactionResult.manifest);
  console.info("Trash purge completed", {
    deletedFiles: transactionResult.result.deletedFiles,
    deletedFolders: transactionResult.result.deletedFolders,
    reclaimedBytes: transactionResult.result.reclaimedBytes,
    userId,
  });
  return transactionResult.result;
}

export async function listTrashForUser(userId: string): Promise<TrashPageData> {
  return buildTrashPageData(userId);
}

export async function getTrashSummary(userId: string): Promise<TrashSummary> {
  return buildTrashSummaryData(userId);
}

export async function restoreFile(userId: string, fileId: string): Promise<FileListItem> {
  const existingFile = await getScopedFileRecord(userId, fileId, { includeDeleted: true });

  if (!existingFile) {
    throw new Error("File not found");
  }

  if (!existingFile.deletedAt) {
    return mapFileListItem(existingFile);
  }

  if (existingFile.folderId) {
    const parentFolder = await getScopedFolderRecord(userId, existingFile.folderId, {
      includeDeleted: true,
    });

    if (parentFolder?.deletedAt) {
      throw new Error("Restore the parent folder first");
    }
  }

  const db = MariadbConnection.getConnection();
  const result = await db
    .update(files)
    .set({ deleted_at: null })
    .where(and(eq(files.id, fileId), eq(files.user_id, userId), sql`${files.deleted_at} is not null`));

  if (getAffectedCount(result) === 0) {
    const currentFile = await getScopedFileRecord(userId, fileId, { includeDeleted: true });

    if (currentFile && !currentFile.deletedAt) {
      return mapFileListItem(currentFile);
    }

    throw new Error("File not found");
  }

  const restoredFile = await getScopedFileRecord(userId, fileId);

  if (!restoredFile) {
    throw new Error("File not found");
  }

  return mapFileListItem(restoredFile);
}

export async function restoreFolder(userId: string, folderId: string) {
  const scopedFolders = await listScopedFolderRecords(userId, { includeDeleted: true });
  const folderMap = new Map(scopedFolders.map((folder) => [folder.id, folder]));
  const targetFolder = folderMap.get(folderId);

  if (!targetFolder) {
    throw new Error("Folder not found");
  }

  if (!targetFolder.deletedAt) {
    return {
      restoredFiles: 0,
      restoredFolders: 0,
    };
  }

  if (targetFolder.parentId && folderMap.get(targetFolder.parentId)?.deletedAt) {
    throw new Error("Restore the parent folder first");
  }

  const subtreeFolderIds = collectFolderSubtreeIds(folderId, scopedFolders);
  const db = MariadbConnection.getConnection();

  return db.transaction(async (tx) => {
    const restoredFolderResult = await tx
      .update(folders)
      .set({ deleted_at: null })
      .where(
        and(
          eq(folders.user_id, userId),
          inArray(folders.id, subtreeFolderIds),
          sql`${folders.deleted_at} is not null`,
        ),
      );
    const restoredFileResult = await tx
      .update(files)
      .set({ deleted_at: null })
      .where(
        and(
          eq(files.user_id, userId),
          inArray(files.folder_id, subtreeFolderIds),
          sql`${files.deleted_at} is not null`,
        ),
      );

    return {
      restoredFiles: getAffectedCount(restoredFileResult),
      restoredFolders: getAffectedCount(restoredFolderResult),
    };
  });
}

export async function permanentlyDeleteFile(userId: string, fileId: string) {
  const existingFile = await getScopedFileRecord(userId, fileId, { includeDeleted: true });

  if (!existingFile?.deletedAt) {
    throw new Error("File not found");
  }

  return purgeDeletedScopeForUser(userId, { fileIds: [fileId] });
}

export async function permanentlyDeleteFolder(userId: string, folderId: string) {
  const scopedFolders = await listScopedFolderRecords(userId, { includeDeleted: true });
  const folderMap = new Map(scopedFolders.map((folder) => [folder.id, folder]));
  const targetFolder = folderMap.get(folderId);

  if (!targetFolder?.deletedAt || !isRootDeletedFolder(targetFolder, folderMap)) {
    throw new Error("Folder not found");
  }

  const subtreeFolderIds = collectFolderSubtreeIds(folderId, scopedFolders);
  return purgeDeletedScopeForUser(userId, { folderIds: subtreeFolderIds });
}

export async function emptyTrash(userId: string) {
  const trash = await buildTrashPageData(userId);
  const scopedFolders = await listScopedFolderRecords(userId, { includeDeleted: true });
  const folderIds = trash.items
    .filter((item) => item.kind === "folder")
    .flatMap((item) => collectFolderSubtreeIds(item.id, scopedFolders));
  const fileIds = trash.items
    .filter((item) => item.kind === "file")
    .map((item) => item.id);

  return purgeDeletedScopeForUser(userId, { fileIds, folderIds });
}

export async function purgeExpiredTrash(now = new Date()): Promise<TrashPurgeResult> {
  const cutoff = getTrashPurgeCutoff(now);
  const db = MariadbConnection.getConnection();
  const [expiredFolders, expiredFiles] = await Promise.all([
    db
      .select({
        createdAt: folders.created_at,
        deletedAt: folders.deleted_at,
        id: folders.id,
        name: folders.name,
        parentId: folders.parent_id,
        userId: folders.user_id,
      })
      .from(folders)
      .where(and(sql`${folders.deleted_at} is not null`, lte(folders.deleted_at, cutoff)))
      .orderBy(asc(folders.deleted_at))
      .limit(TRASH_PURGE_BATCH_SIZE),
    db
      .select({
        createdAt: files.created_at,
        deletedAt: files.deleted_at,
        folderId: files.folder_id,
        id: files.id,
        mimeType: files.mime_type,
        name: files.name,
        size: files.size,
        status: files.status,
        thumbnailR2Key: files.thumbnail_r2_key,
        updatedAt: files.updated_at,
        userId: files.user_id,
      })
      .from(files)
      .where(and(sql`${files.deleted_at} is not null`, lte(files.deleted_at, cutoff)))
      .orderBy(asc(files.deleted_at))
      .limit(TRASH_PURGE_BATCH_SIZE),
  ]);

  const candidateUserIds = [...new Set([
    ...expiredFolders.map((folder) => folder.userId),
    ...expiredFiles.map((file) => file.userId),
  ])];

  let deletedFiles = 0;
  let deletedFolders = 0;
  let reclaimedBytes = 0;

  for (const userId of candidateUserIds) {
    const userFolders = await listScopedFolderRecords(userId, { includeDeleted: true });
    const folderMap = new Map(userFolders.map((folder) => [folder.id, folder]));
    const userExpiredFolderIds = expiredFolders
      .filter((folder) => folder.userId === userId && isRootDeletedFolder(folder, folderMap))
      .map((folder) => folder.id);
    const userExpiredFileIds = expiredFiles
      .filter((file) => file.userId === userId && isRootDeletedFile(file, folderMap))
      .map((file) => file.id);

    if (userExpiredFolderIds.length === 0 && userExpiredFileIds.length === 0) {
      continue;
    }

    const folderIds = userExpiredFolderIds.flatMap((folderId) =>
      collectFolderSubtreeIds(folderId, userFolders),
    );
    const result = await purgeDeletedScopeForUser(userId, {
      fileIds: userExpiredFileIds,
      folderIds,
    });

    deletedFiles += result.deletedFiles;
    deletedFolders += result.deletedFolders;
    reclaimedBytes += result.reclaimedBytes;
  }

  console.info("Expired trash cleanup completed", {
    cutoff: cutoff.toISOString(),
    deletedFiles,
    deletedFolders,
    reclaimedBytes,
  });

  return {
    deletedFiles,
    deletedFolders,
    reclaimedBytes,
  };
}

export async function cleanupExpiredUploads(
  now = new Date(),
): Promise<ExpiredUploadCleanupResult> {
  const db = MariadbConnection.getConnection();
  const expiredSessions = await db
    .select({
      expiresAt: uploadSessions.expires_at,
      fileId: uploadSessions.file_id,
      id: uploadSessions.id,
      userId: uploadSessions.user_id,
    })
    .from(uploadSessions)
    .where(and(eq(uploadSessions.status, "uploading"), lt(uploadSessions.expires_at, now)))
    .orderBy(asc(uploadSessions.expires_at))
    .limit(STALE_UPLOAD_CLEANUP_BATCH_SIZE);

  if (expiredSessions.length === 0) {
    return {
      deletedFiles: 0,
      expiredSessions: 0,
    };
  }

  const fileIds = [...new Set(expiredSessions.map((session) => session.fileId))];
  const fileRows = await loadFilesForPurge(db, { fileIds });
  const manifest = await buildPurgeManifest(db, fileRows);

  const deletedFileResult = await db.transaction(async (tx) => {
    const result = await tx.delete(files).where(inArray(files.id, fileIds));
    return getAffectedCount(result);
  });

  await deleteR2ObjectsFromManifest(manifest);
  console.info("Expired upload cleanup completed", {
    deletedFiles: deletedFileResult,
    expiredSessions: expiredSessions.length,
  });

  return {
    deletedFiles: deletedFileResult,
    expiredSessions: expiredSessions.length,
  };
}
