import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { MariadbConnection } from "@/lib/db";
import { files, folders } from "@/lib/db/schema";
import type {
  FilenameSearchResult,
  SearchResultFolderPathItem,
} from "@/lib/search/types";

const DEFAULT_FILENAME_SEARCH_LIMIT = 20;
export const MAX_FILENAME_SEARCH_LIMIT = 50;

type FilenameSearchFolderRow = {
  id: string;
  name: string;
  parentId: string | null;
};

export function normalizeFilenameSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function getFilenameSearchRank(name: string, normalizedQuery: string) {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName === normalizedQuery) {
    return 0;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 1;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 2;
  }

  return 3;
}

function clampFilenameSearchLimit(limit?: number) {
  if (!Number.isFinite(limit) || !limit) {
    return DEFAULT_FILENAME_SEARCH_LIMIT;
  }

  return Math.min(MAX_FILENAME_SEARCH_LIMIT, Math.max(1, Math.trunc(limit)));
}

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
  const escapedQuery = escapeLikePattern(normalizedQuery);
  const prefixPattern = `${escapedQuery}%`;
  const substringPattern = `%${escapedQuery}%`;
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
        sql`lower(${files.name}) like ${substringPattern} escape '\\'`,
      ),
    )
    .orderBy(
      sql`
        case
          when lower(${files.name}) = ${normalizedQuery} then 0
          when lower(${files.name}) like ${prefixPattern} escape '\\' then 1
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
      updatedAt: file.updatedAt.toISOString(),
    };
  });
}
