import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { MariadbConnection } from "@/lib/db";
import {
  files,
  folders,
  shareLinkAccessLogs,
  shareLinkEmails,
  shareLinks,
} from "@/lib/db/schema";

type CreateShareLinkInput = {
  createdBy: string;
  fileId?: string;
  folderId?: string;
  expiresAt: Date | null;
  maxDownloads: number | null;
  allowedEmails: string[];
};

type ShareLinkRow = typeof shareLinks.$inferSelect;

export type ShareLinkRecord = ShareLinkRow & {
  allowedEmails: string[];
  targetId: string;
  targetType: "file" | "folder";
};

export type SharedFolderContents = {
  breadcrumb: Array<{ id: string; name: string }>;
  currentFolder: { id: string; name: string };
  files: Array<{
    id: string;
    mimeType: string;
    name: string;
    size: number;
    updatedAt: Date;
  }>;
  folders: Array<{
    id: string;
    name: string;
    updatedAt: Date;
  }>;
};

export type SharedFileSummary = {
  id: string;
  mimeType: string;
  name: string;
};

function getAffectedCount(result: unknown) {
  if (Array.isArray(result)) {
    return getAffectedCount(result[0]);
  }

  if (!result || typeof result !== "object") {
    return 0;
  }

  const candidate = result as { affectedRows?: number; rowsAffected?: number };
  return candidate.rowsAffected ?? candidate.affectedRows ?? 0;
}

function normalizeEmails(emails: string[]) {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))].sort();
}

export class ShareServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ShareServiceError";
    this.code = code;
    this.status = status;
  }
}

function createLinkNotFoundError() {
  return new ShareServiceError("NOT_FOUND", "Share link not found", 404);
}

function createExpiredError() {
  return new ShareServiceError("EXPIRED", "Share link is expired", 410);
}

function createDownloadLimitError() {
  return new ShareServiceError("DOWNLOAD_LIMIT_REACHED", "Download limit reached", 403);
}

function createInvalidDownloadLimitError() {
  return new ShareServiceError(
    "INVALID_DOWNLOAD_LIMIT",
    "Max downloads cannot be lower than the current download count",
    400,
  );
}

export async function createShareLink(input: CreateShareLinkInput) {
  const { createdBy, expiresAt, fileId, folderId, maxDownloads } = input;

  if (fileId && folderId) {
    throw new ShareServiceError(
      "INVALID_TARGET",
      "Cannot share both a file and a folder in the same link",
      400,
    );
  }

  if (!fileId && !folderId) {
    throw new ShareServiceError(
      "INVALID_TARGET",
      "Must specify either a fileId or folderId to share",
      400,
    );
  }

  const db = MariadbConnection.getConnection();

  if (fileId) {
    const [file] = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.user_id, createdBy),
          eq(files.status, "ready"),
          isNull(files.deleted_at),
        ),
      )
      .limit(1);

    if (!file) {
      throw new ShareServiceError("TARGET_NOT_FOUND", "File not found", 404);
    }
  }

  if (folderId) {
    const [folder] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.user_id, createdBy),
          isNull(folders.deleted_at),
        ),
      )
      .limit(1);

    if (!folder) {
      throw new ShareServiceError("TARGET_NOT_FOUND", "Folder not found", 404);
    }
  }

  const allowedEmails = normalizeEmails(input.allowedEmails);
  const isPublic = allowedEmails.length === 0;
  const id = nanoid();
  const token = nanoid(32);

  await db.transaction(async (tx) => {
    await tx.insert(shareLinks).values({
      created_by: createdBy,
      download_count: 0,
      expires_at: expiresAt,
      file_id: fileId ?? null,
      folder_id: folderId ?? null,
      id,
      is_public: isPublic,
      max_downloads: maxDownloads,
      token,
    });

    if (allowedEmails.length > 0) {
      await tx.insert(shareLinkEmails).values(
        allowedEmails.map((email) => ({
          email,
          id: nanoid(),
          link_id: id,
        })),
      );
    }
  });

  return {
    allowedEmails,
    downloadCount: 0,
    expiresAt,
    id,
    isPublic,
    maxDownloads,
    token,
    url: `/s/${token}`,
  };
}

export async function getShareLinkByToken(token: string): Promise<ShareLinkRecord | null> {
  const db = MariadbConnection.getConnection();
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);

  if (!link) {
    return null;
  }

  const emails = await db
    .select({ email: shareLinkEmails.email })
    .from(shareLinkEmails)
    .where(eq(shareLinkEmails.link_id, link.id));

  return {
    ...link,
    allowedEmails: emails.map((item) => item.email).sort(),
    targetId: link.file_id ?? link.folder_id ?? "",
    targetType: link.file_id ? "file" : "folder",
  };
}

export async function requireShareLinkByToken(token: string): Promise<ShareLinkRecord> {
  const link = await getShareLinkByToken(token);

  if (!link) {
    throw createLinkNotFoundError();
  }

  return link;
}

export function assertShareLinkAccessible(link: {
  expires_at: Date | null;
  revoked_at: Date | null;
}) {
  if (link.revoked_at) {
    throw createLinkNotFoundError();
  }

  if (link.expires_at && link.expires_at < new Date()) {
    throw createExpiredError();
  }
}

export async function listShareLinksForOwner(input: {
  ownerId: string;
  fileId?: string;
  folderId?: string;
}) {
  const { fileId, folderId, ownerId } = input;

  if (fileId && folderId) {
    throw new ShareServiceError("INVALID_TARGET", "Cannot query both a file and a folder", 400);
  }

  if (!fileId && !folderId) {
    throw new ShareServiceError("INVALID_TARGET", "Must specify either a fileId or folderId", 400);
  }

  const db = MariadbConnection.getConnection();
  const predicates = [eq(shareLinks.created_by, ownerId), isNull(shareLinks.revoked_at)];

  if (fileId) {
    predicates.push(eq(shareLinks.file_id, fileId));
  }

  if (folderId) {
    predicates.push(eq(shareLinks.folder_id, folderId));
  }

  const links = await db
    .select()
    .from(shareLinks)
    .where(and(...predicates))
    .orderBy(desc(shareLinks.created_at));

  if (links.length === 0) {
    return [];
  }

  const emails = await db
    .select({ email: shareLinkEmails.email, linkId: shareLinkEmails.link_id })
    .from(shareLinkEmails)
    .where(inArray(shareLinkEmails.link_id, links.map((link) => link.id)));

  const emailsByLinkId = new Map<string, string[]>();

  for (const entry of emails) {
    const current = emailsByLinkId.get(entry.linkId) ?? [];
    current.push(entry.email);
    emailsByLinkId.set(entry.linkId, current);
  }

  return links.map((link) => ({
    ...link,
    allowedEmails: [...(emailsByLinkId.get(link.id) ?? [])].sort(),
    targetId: link.file_id ?? link.folder_id,
    targetType: link.file_id ? ("file" as const) : ("folder" as const),
  }));
}

export async function getShareLinkForOwnerById(input: {
  id: string;
  ownerId: string;
}) {
  const db = MariadbConnection.getConnection();
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, input.id), eq(shareLinks.created_by, input.ownerId)))
    .limit(1);

  if (!link) {
    throw createLinkNotFoundError();
  }

  return link;
}

export async function updateShareLinkSettings(input: {
  allowedEmails: string[];
  id: string;
  maxDownloads: number | null;
  ownerId: string;
}) {
  const db = MariadbConnection.getConnection();
  const allowedEmails = normalizeEmails(input.allowedEmails);
  const [existingLink] = await db
    .select({ download_count: shareLinks.download_count, id: shareLinks.id })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.id, input.id),
        eq(shareLinks.created_by, input.ownerId),
        isNull(shareLinks.revoked_at),
      ),
    )
    .limit(1);

  if (!existingLink) {
    throw createLinkNotFoundError();
  }

  if (input.maxDownloads !== null && input.maxDownloads < existingLink.download_count) {
    throw createInvalidDownloadLimitError();
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(shareLinkEmails)
      .where(eq(shareLinkEmails.link_id, input.id));

    await tx
      .update(shareLinks)
      .set({
        is_public: allowedEmails.length === 0,
        max_downloads: input.maxDownloads,
      })
      .where(eq(shareLinks.id, input.id));

    if (allowedEmails.length > 0) {
      await tx.insert(shareLinkEmails).values(
        allowedEmails.map((email) => ({
          email,
          id: nanoid(),
          link_id: input.id,
        })),
      );
    }
  });

  const link = await getShareLinkForOwnerById({
    id: input.id,
    ownerId: input.ownerId,
  });
  const emails = await db
    .select({ email: shareLinkEmails.email })
    .from(shareLinkEmails)
    .where(eq(shareLinkEmails.link_id, input.id));

  return {
    ...link,
    allowedEmails: emails.map((entry) => entry.email).sort(),
    targetId: link.file_id ?? link.folder_id,
    targetType: link.file_id ? ("file" as const) : ("folder" as const),
  };
}

export async function revokeShareLink({ id, ownerId }: { id: string; ownerId: string }) {
  const db = MariadbConnection.getConnection();
  const result = await db
    .update(shareLinks)
    .set({ revoked_at: new Date() })
    .where(and(eq(shareLinks.id, id), eq(shareLinks.created_by, ownerId), isNull(shareLinks.revoked_at)));

  if (getAffectedCount(result) === 0) {
    const [existingLink] = await db
      .select({ id: shareLinks.id })
      .from(shareLinks)
      .where(and(eq(shareLinks.id, id), eq(shareLinks.created_by, ownerId)))
      .limit(1);

    if (!existingLink) {
      throw createLinkNotFoundError();
    }
  }
}

export async function recordShareAccess(input: {
  email?: string | null;
  ipAddress: string;
  linkId: string;
  userAgent?: string;
}) {
  const db = MariadbConnection.getConnection();

  await db.insert(shareLinkAccessLogs).values({
    email: input.email ?? null,
    id: nanoid(),
    ip_address: input.ipAddress,
    link_id: input.linkId,
    user_agent: input.userAgent ?? null,
  });
}

export async function incrementDownloadCount(linkId: string) {
  const db = MariadbConnection.getConnection();
  const [before] = await db
    .select({
      downloadCount: shareLinks.download_count,
      id: shareLinks.id,
      maxDownloads: shareLinks.max_downloads,
    })
    .from(shareLinks)
    .where(eq(shareLinks.id, linkId))
    .limit(1);

  if (!before) {
    return false;
  }

  if (before.maxDownloads !== null && before.downloadCount >= before.maxDownloads) {
    return false;
  }

  const result = await db
    .update(shareLinks)
    .set({
      download_count: sql`${shareLinks.download_count} + 1`,
    })
    .where(
      and(
        eq(shareLinks.id, linkId),
        or(
          isNull(shareLinks.max_downloads),
          sql`${shareLinks.download_count} < ${shareLinks.max_downloads}`,
        ),
      ),
    );

  if (getAffectedCount(result) > 0) {
    return true;
  }

  const [after] = await db
    .select({
      downloadCount: shareLinks.download_count,
      id: shareLinks.id,
    })
    .from(shareLinks)
    .where(eq(shareLinks.id, linkId))
    .limit(1);

  return Boolean(after && after.downloadCount > before.downloadCount);
}

export async function assertDownloadAllowed(linkId: string) {
  const canDownload = await incrementDownloadCount(linkId);

  if (!canDownload) {
    throw createDownloadLimitError();
  }
}

export async function requireFolderShareTargetFile(options: {
  fileId: string;
  ownerId: string;
  rootFolderId: string;
}) {
  const db = MariadbConnection.getConnection();
  const [file] = await db
    .select({
      folderId: files.folder_id,
      id: files.id,
    })
    .from(files)
    .where(
      and(
        eq(files.id, options.fileId),
        eq(files.user_id, options.ownerId),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
      ),
    )
    .limit(1);

  if (!file?.folderId) {
    throw createLinkNotFoundError();
  }

  const allowedFolderIds = await getFolderSubtreeIds(options.ownerId, options.rootFolderId);

  if (!allowedFolderIds.has(file.folderId)) {
    throw createLinkNotFoundError();
  }

  return file.id;
}

export async function requireSharedFileSummary(options: {
  fileId: string;
  ownerId: string;
}): Promise<SharedFileSummary> {
  const db = MariadbConnection.getConnection();
  const [file] = await db
    .select({
      id: files.id,
      mimeType: files.mime_type,
      name: files.name,
    })
    .from(files)
    .where(
      and(
        eq(files.id, options.fileId),
        eq(files.user_id, options.ownerId),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
      ),
    )
    .limit(1);

  if (!file) {
    throw createLinkNotFoundError();
  }

  return file;
}

export async function requireSharedFolderContents(options: {
  currentFolderId: string;
  ownerId: string;
  rootFolderId: string;
}): Promise<SharedFolderContents> {
  const db = MariadbConnection.getConnection();
  const folderRecords = await db
    .select({
      createdAt: folders.created_at,
      id: folders.id,
      name: folders.name,
      parentId: folders.parent_id,
    })
    .from(folders)
    .where(and(eq(folders.user_id, options.ownerId), isNull(folders.deleted_at)));

  const folderMap = new Map(folderRecords.map((folder) => [folder.id, folder]));
  const rootFolder = folderMap.get(options.rootFolderId);
  const currentFolder = folderMap.get(options.currentFolderId);

  if (!rootFolder || !currentFolder) {
    throw createLinkNotFoundError();
  }

  const allowedFolderIds = collectFolderSubtreeIds(options.rootFolderId, folderRecords);

  if (!allowedFolderIds.has(options.currentFolderId)) {
    throw createLinkNotFoundError();
  }

  const breadcrumb = buildBreadcrumb(options.rootFolderId, options.currentFolderId, folderMap);
  const childFolders = folderRecords
    .filter((folder) => folder.parentId === options.currentFolderId)
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      updatedAt: folder.createdAt,
    }));

  const childFiles = await db
    .select({
      id: files.id,
      mimeType: files.mime_type,
      name: files.name,
      size: files.size,
      updatedAt: files.updated_at,
    })
    .from(files)
    .where(
      and(
        eq(files.user_id, options.ownerId),
        eq(files.status, "ready"),
        eq(files.folder_id, options.currentFolderId),
        isNull(files.deleted_at),
      ),
    );

  return {
    breadcrumb,
    currentFolder: {
      id: currentFolder.id,
      name: currentFolder.name,
    },
    files: childFiles,
    folders: childFolders,
  };
}

async function getFolderSubtreeIds(ownerId: string, rootFolderId: string) {
  const db = MariadbConnection.getConnection();
  const folderRecords = await db
    .select({
      id: folders.id,
      parentId: folders.parent_id,
    })
    .from(folders)
    .where(and(eq(folders.user_id, ownerId), isNull(folders.deleted_at)));

  return collectFolderSubtreeIds(rootFolderId, folderRecords);
}

function collectFolderSubtreeIds(
  rootFolderId: string,
  folderRecords: Array<{ id: string; parentId: string | null }>,
) {
  const childIdsByParent = new Map<string, string[]>();

  for (const folder of folderRecords) {
    if (!folder.parentId) {
      continue;
    }

    const current = childIdsByParent.get(folder.parentId) ?? [];
    current.push(folder.id);
    childIdsByParent.set(folder.parentId, current);
  }

  const visited = new Set<string>();
  const toVisit = [rootFolderId];

  while (toVisit.length > 0) {
    const currentFolderId = toVisit.pop();

    if (!currentFolderId || visited.has(currentFolderId)) {
      continue;
    }

    visited.add(currentFolderId);

    for (const childId of childIdsByParent.get(currentFolderId) ?? []) {
      toVisit.push(childId);
    }
  }

  return visited;
}

function buildBreadcrumb(
  rootFolderId: string,
  currentFolderId: string,
  folderMap: Map<string, { id: string; name: string; parentId: string | null }>,
) {
  const breadcrumb: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  let cursor: string | null = currentFolderId;

  while (cursor) {
    if (seen.has(cursor)) {
      throw createLinkNotFoundError();
    }

    seen.add(cursor);
    const folder = folderMap.get(cursor);

    if (!folder) {
      throw createLinkNotFoundError();
    }

    breadcrumb.unshift({ id: folder.id, name: folder.name });

    if (cursor === rootFolderId) {
      return breadcrumb;
    }

    cursor = folder.parentId;
  }

  throw createLinkNotFoundError();
}
