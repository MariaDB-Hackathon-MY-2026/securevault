import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { EmbeddingJobRepository } from "@/lib/ai/embeddings/embedding-job-repository";
import { cosineSimilarity, serializeVector } from "@/lib/ai/embeddings/vector";
import { MariadbConnection } from "@/lib/db";
import { embeddingChunks, embeddingJobs, files } from "@/lib/db/schema";
import { canPreviewMime } from "@/lib/files/preview";
import type {
  SemanticSearchMatchType,
  SemanticSearchResult,
} from "@/lib/search/types";

type SemanticCandidateRow = {
  chunkIndex: number;
  chunkType: "full" | "page" | "window";
  embedding: Buffer | string;
  fileId: string;
  folderId: string | null;
  mimeType: string;
  modality: "image" | "pdf";
  name: string;
  pageFrom: number | null;
  pageTo: number | null;
  score: number;
  size: number;
  updatedAt: Date;
};

type RawSemanticCandidateRow = Omit<SemanticCandidateRow, "updatedAt"> & {
  updatedAt: Date | string;
};

const repository = new EmbeddingJobRepository();

function buildFolderPath(
  folderId: string | null,
  folderMap: Map<string, { id: string; name: string; parentId: string | null }>,
) {
  if (!folderId) {
    return [];
  }

  const path: Array<{ id: string; name: string }> = [];
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

function parseStoredVector(value: Buffer | string) {
  const normalizedValue = Buffer.isBuffer(value) ? value.toString("utf8") : value;

  return JSON.parse(normalizedValue) as number[];
}

function normalizeUpdatedAt(value: Date | string) {
  if (value instanceof Date) {
    return value;
  }

  return new Date(value);
}

function normalizeCandidateRow(row: RawSemanticCandidateRow): SemanticCandidateRow {
  return {
    ...row,
    updatedAt: normalizeUpdatedAt(row.updatedAt),
  };
}

function getChunkTypePriority(chunkType: SemanticCandidateRow["chunkType"]) {
  switch (chunkType) {
    case "page":
      return 0;
    case "window":
      return 1;
    default:
      return 2;
  }
}

function getMatchType(row: Pick<SemanticCandidateRow, "chunkType" | "modality">): SemanticSearchMatchType {
  if (row.modality === "image") {
    return "image";
  }

  return row.chunkType === "page"
    ? "pdf_page"
    : row.chunkType === "window"
      ? "pdf_window"
      : "pdf_full";
}

function compareRepresentativeChunks(left: SemanticCandidateRow, right: SemanticCandidateRow) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const priorityDelta = getChunkTypePriority(left.chunkType) - getChunkTypePriority(right.chunkType);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return left.chunkIndex - right.chunkIndex;
}

async function fetchCandidatesViaDatabase(input: {
  queryTopK: number;
  queryVector: number[];
  userId: string;
}) {
  const db = MariadbConnection.getConnection();
  const serializedVector = serializeVector(input.queryVector);
  const rows = await db.execute(sql`
    select
      ${embeddingChunks.chunk_index} as chunkIndex,
      ${embeddingChunks.chunk_type} as chunkType,
      ${embeddingChunks.embedding} as embedding,
      ${embeddingChunks.file_id} as fileId,
      ${files.folder_id} as folderId,
      ${files.mime_type} as mimeType,
      ${embeddingChunks.modality} as modality,
      ${files.name} as name,
      ${embeddingChunks.page_from} as pageFrom,
      ${embeddingChunks.page_to} as pageTo,
      (1 - vec_distance_cosine(${embeddingChunks.embedding}, VEC_FromText(${serializedVector}))) as score,
      ${files.size} as size,
      ${files.updated_at} as updatedAt
    from ${embeddingChunks}
    inner join ${embeddingJobs} on ${embeddingJobs.id} = ${embeddingChunks.job_id}
    inner join ${files} on ${files.id} = ${embeddingChunks.file_id}
    where ${files.user_id} = ${input.userId}
      and ${files.status} = 'ready'
      and ${files.deleted_at} is null
      and ${embeddingJobs.status} = 'ready'
    order by score desc, ${files.updated_at} desc, ${files.id} asc
    limit ${input.queryTopK}
  `);

  const [resultRows] = rows as unknown as [RawSemanticCandidateRow[]];
  return (resultRows ?? []).map(normalizeCandidateRow);
}

async function fetchCandidatesViaFallback(input: {
  queryTopK: number;
  queryVector: number[];
  userId: string;
}) {
  const db = MariadbConnection.getConnection();
  const rows = await db
    .select({
      chunkIndex: embeddingChunks.chunk_index,
      chunkType: embeddingChunks.chunk_type,
      embedding: sql<string>`VEC_ToText(${embeddingChunks.embedding})`,
      fileId: files.id,
      folderId: files.folder_id,
      mimeType: files.mime_type,
      modality: embeddingChunks.modality,
      name: files.name,
      pageFrom: embeddingChunks.page_from,
      pageTo: embeddingChunks.page_to,
      size: files.size,
      updatedAt: files.updated_at,
    })
    .from(embeddingChunks)
    .innerJoin(embeddingJobs, eq(embeddingJobs.id, embeddingChunks.job_id))
    .innerJoin(files, eq(files.id, embeddingChunks.file_id))
    .where(
      and(
        eq(files.user_id, input.userId),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
        eq(embeddingJobs.status, "ready"),
      ),
    );

  return rows
    .map((row) => normalizeCandidateRow({
      ...row,
      score: cosineSimilarity(parseStoredVector(row.embedding), input.queryVector),
    }))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const updatedAtDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
      if (updatedAtDelta !== 0) {
        return updatedAtDelta;
      }

      return left.fileId.localeCompare(right.fileId);
    })
    .slice(0, input.queryTopK);
}

async function fetchSemanticCandidates(input: {
  queryTopK: number;
  queryVector: number[];
  userId: string;
}) {
  try {
    return await fetchCandidatesViaDatabase(input);
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    console.warn("Falling back to application-side semantic scoring", error);
    return fetchCandidatesViaFallback(input);
  }
}

export async function searchSemanticFiles(input: {
  limit: number;
  queryTopK: number;
  queryVector: number[];
  userId: string;
}): Promise<SemanticSearchResult[]> {
  const candidates = await fetchSemanticCandidates(input);
  if (candidates.length === 0) {
    return [];
  }

  const grouped = new Map<string, SemanticCandidateRow>();

  for (const candidate of candidates) {
    const current = grouped.get(candidate.fileId);
    if (!current || compareRepresentativeChunks(current, candidate) > 0) {
      grouped.set(candidate.fileId, candidate);
    }
  }

  const representativeRows = [...grouped.values()].sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    const updatedAtDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    return left.fileId.localeCompare(right.fileId);
  }).slice(0, input.limit);

  const folderRows = await repository.listFolderRows(input.userId);
  const folderMap = new Map(folderRows.map((folder) => [folder.id, folder]));

  return representativeRows.map((row) => ({
    canPreview: canPreviewMime(row.mimeType),
    fileId: row.fileId,
    folderId: row.folderId,
    folderPath: buildFolderPath(row.folderId, folderMap),
    isInRoot: row.folderId === null,
    matchType: getMatchType(row),
    mimeType: row.mimeType,
    name: row.name,
    pageFrom: row.pageFrom,
    pageTo: row.pageTo,
    score: row.score,
    size: row.size,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
