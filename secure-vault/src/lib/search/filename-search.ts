import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { files, folders } from "@/lib/db/schema";
import {
  clampFilenameSearchLimit,
  escapeLikePattern,
  getFilenameSearchRank,
  normalizeFilenameSearchQuery,
} from "@/lib/search/filename-search-shared";
import type {
  FilenameSearchResult,
  SearchResultFolderPathItem,
} from "@/lib/search/types";

export {
  escapeLikePattern,
  getFilenameSearchRank,
  normalizeFilenameSearchQuery,
};

type FilenameSearchFolderRow = {
  id: string;
  name: string;
  parentId: string | null;
};

function buildFolderPath(
  folderId: string | null,
  folderMap: Map<string, FilenameSearchFolderRow>,
): SearchResultFolderPathItem[] {
  if (!folderId) {
    return [];
  }

  const path: SearchResultFolderPathItem[] = [];
  const seen = new Set<string>();
  let cursor: string | null = folderId;

  while (cursor) {
    if (seen.has(cursor)) {
      break;
    }

    seen.add(cursor);
    const folder = folderMap.get(cursor);
    if (!folder) {
      break;
    }

    path.unshift({ id: folder.id, name: folder.name });
    cursor = folder.parentId;
  }

  return path;
}

export async function searchFilesByFilename(input: {
  limit?: number;
  query: string;
  userId: string;
}): Promise<FilenameSearchResult[]> {
  const normalizedQuery = normalizeFilenameSearchQuery(input.query);
  const normalizedLimit = clampFilenameSearchLimit(input.limit);
  const db = MariadbConnection.getConnection();

  const matchedFiles = await db
    .select({
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
        eq(files.user_id, input.userId),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
        sql`locate(${normalizedQuery}, lower(${files.name})) > 0`,
      ),
    )
    .orderBy(
      sql`
        case
          when lower(${files.name}) = ${normalizedQuery} then 0
          when locate(${normalizedQuery}, lower(${files.name})) = 1 then 1
          else 2
        end
      `,
      desc(files.updated_at),
    )
    .limit(normalizedLimit);

  if (matchedFiles.length === 0) {
    return [];
  }

  const folderRows = await db
    .select({
      id: folders.id,
      name: folders.name,
      parentId: folders.parent_id,
    })
    .from(folders)
    .where(and(eq(folders.user_id, input.userId), isNull(folders.deleted_at)));
  const folderMap = new Map(folderRows.map((folder) => [folder.id, folder]));

  return matchedFiles.map((file) => {
    const folderPath = buildFolderPath(file.folderId, folderMap);

    return {
      folderId: file.folderId,
      folderPath,
      id: file.id,
      isInRoot: file.folderId === null,
      mimeType: file.mimeType,
      name: file.name,
      size: file.size,
      updatedAt: new Date(file.updatedAt).toISOString(),
    };
  });
}
