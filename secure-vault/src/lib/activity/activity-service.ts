import { files, folders, shareLinkAccessLogs, shareLinks } from "@/lib/db/schema";
import { MariadbConnection } from "@/lib/db";
import { sql, type SQLWrapper } from "drizzle-orm";

import {
  compareActivityFeedEntries,
  createActivityCursorFromEntry,
  getActivitySourceKindRank,
  serializeActivityCursor,
  type ActivityCursor,
  type ActivityEventKind,
  type ActivityFeedEntry,
  type ActivityFeedPage,
  type ActivityTargetType,
} from "@/lib/activity/activity-types";

const DEFAULT_ACTIVITY_PAGE_SIZE = 20;
const MAX_ACTIVITY_PAGE_SIZE = 30;
const SOURCE_BATCH_OVERFETCH = 1;
const DELETED_ITEM_LABEL = "Deleted item";

type ActivitySourceLoader = (input: {
  cursor: ActivityCursor | null;
  limit: number;
  userId: string;
}) => Promise<ActivityFeedEntry[]>;

type UploadActivityRow = {
  fileDeletedAt?: unknown;
  fileName?: unknown;
  occurredAt?: unknown;
  occurredAtApproximate?: unknown;
  sourceId?: unknown;
  targetId?: unknown;
};

type ShareActivityRow = {
  actorLabel?: unknown;
  fileDeletedAt?: unknown;
  fileId?: unknown;
  fileName?: unknown;
  folderDeletedAt?: unknown;
  folderId?: unknown;
  folderName?: unknown;
  occurredAt?: unknown;
  sourceId?: unknown;
};

export async function getActivityFeedForUser(input: {
  cursor?: ActivityCursor | null;
  pageSize?: number;
  userId: string;
}): Promise<ActivityFeedPage> {
  const pageSize = clampPageSize(input.pageSize);
  const sources = createSourceStates(input.userId, input.cursor ?? null, pageSize);

  while (true) {
    const bufferedEntries = sources.flatMap((source) => source.entries);

    if (bufferedEntries.length >= pageSize + 1 || sources.every((source) => source.exhausted)) {
      const orderedEntries = bufferedEntries.sort(compareActivityFeedEntries);
      const pageEntries = orderedEntries.slice(0, pageSize);
      const nextEntry = orderedEntries[pageSize];

      return {
        entries: pageEntries,
        hasMore: Boolean(nextEntry),
        nextCursor: nextEntry ? serializeActivityCursor(createActivityCursorFromEntry(pageEntries.at(-1)!)) : null,
      };
    }

    const remainingNeeded = pageSize + 1 - bufferedEntries.length;
    const sourcesToLoad = sources.filter((source) => !source.exhausted);

    if (sourcesToLoad.length === 0) {
      break;
    }

    await Promise.all(
      sourcesToLoad.map(async (source) => {
        const batchLimit = Math.max(remainingNeeded, pageSize) + SOURCE_BATCH_OVERFETCH;
        const nextEntries = await source.load({
          cursor: source.cursor,
          limit: batchLimit,
          userId: input.userId,
        });

        source.entries.push(...nextEntries);
        source.exhausted = nextEntries.length < batchLimit;
        source.cursor = nextEntries.length > 0
          ? createActivityCursorFromEntry(nextEntries[nextEntries.length - 1]!)
          : source.cursor;
      }),
    );
  }

  return {
    entries: [],
    hasMore: false,
    nextCursor: null,
  };
}

function clampPageSize(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_ACTIVITY_PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(value), 1), MAX_ACTIVITY_PAGE_SIZE);
}

function createSourceStates(userId: string, initialCursor: ActivityCursor | null, pageSize: number) {
  const loaders: ActivitySourceLoader[] = [
    loadIndexedUploadCompletedActivity,
    loadApproximateUploadCompletedActivity,
    loadShareRevokedActivity,
    loadShareCreatedActivity,
    loadShareAccessedActivity,
  ];

  return loaders.map((load) => ({
    cursor: initialCursor,
    entries: [] as ActivityFeedEntry[],
    exhausted: false,
    load: async (input: Parameters<ActivitySourceLoader>[0]) => load({
      ...input,
      limit: Math.max(input.limit, pageSize + SOURCE_BATCH_OVERFETCH),
      userId,
    }),
  }));
}

async function loadIndexedUploadCompletedActivity(input: {
  cursor: ActivityCursor | null;
  limit: number;
  userId: string;
}) {
  return loadUploadCompletedActivityByTimestamp({
    ...input,
    occurredAtApproximateExpression: sql`
      CASE
        WHEN ${files.upload_completed_at_approximate} = 1 THEN 1
        ELSE 0
      END
    `,
    occurredAtExpression: files.upload_completed_at,
    requiredTimestampClause: sql`${files.upload_completed_at} IS NOT NULL`,
  });
}

async function loadApproximateUploadCompletedActivity(input: {
  cursor: ActivityCursor | null;
  limit: number;
  userId: string;
}) {
  return loadUploadCompletedActivityByTimestamp({
    ...input,
    occurredAtApproximateExpression: sql`1`,
    occurredAtExpression: files.created_at,
    requiredTimestampClause: sql`${files.upload_completed_at} IS NULL`,
  });
}

async function loadUploadCompletedActivityByTimestamp(input: {
  cursor: ActivityCursor | null;
  limit: number;
  occurredAtApproximateExpression: SQLWrapper;
  occurredAtExpression: SQLWrapper;
  requiredTimestampClause: SQLWrapper;
  userId: string;
}) {
  const db = MariadbConnection.getConnection();
  const sourceIdExpression = createBinarySortExpression(files.id);
  const cursorPredicate = buildCursorPredicate({
    cursor: input.cursor,
    occurredAtExpression: input.occurredAtExpression,
    sourceIdExpression,
    sourceKindRank: getActivitySourceKindRank("upload_completed"),
  });
  const rawResult = await db.execute(sql`
    SELECT
      ${files.id} AS sourceId,
      ${input.occurredAtExpression} AS occurredAt,
      ${input.occurredAtApproximateExpression} AS occurredAtApproximate,
      ${files.id} AS targetId,
      ${files.name} AS fileName,
      ${files.deleted_at} AS fileDeletedAt
    FROM ${files}
    WHERE ${files.user_id} = ${input.userId}
      AND ${files.status} = 'ready'
      AND ${input.requiredTimestampClause}
      AND ${cursorPredicate}
    ORDER BY ${input.occurredAtExpression} DESC, ${sourceIdExpression} DESC
    LIMIT ${input.limit}
  `);

  return unwrapSelectRows(rawResult)
    .map((row) => mapUploadCompletedRow(row))
    .filter((entry): entry is ActivityFeedEntry => entry !== null);
}

async function loadShareCreatedActivity(input: {
  cursor: ActivityCursor | null;
  limit: number;
  userId: string;
}) {
  return loadShareLinkActivityKind({
    ...input,
    kind: "share_created",
    occurredAtExpression: shareLinks.created_at,
    requiredTimestampClause: sql`1 = 1`,
  });
}

async function loadShareRevokedActivity(input: {
  cursor: ActivityCursor | null;
  limit: number;
  userId: string;
}) {
  return loadShareLinkActivityKind({
    ...input,
    kind: "share_revoked",
    occurredAtExpression: shareLinks.revoked_at,
    requiredTimestampClause: sql`${shareLinks.revoked_at} IS NOT NULL`,
  });
}

async function loadShareLinkActivityKind(input: {
  cursor: ActivityCursor | null;
  kind: Extract<ActivityEventKind, "share_created" | "share_revoked">;
  limit: number;
  occurredAtExpression: SQLWrapper;
  requiredTimestampClause: SQLWrapper;
  userId: string;
}) {
  const db = MariadbConnection.getConnection();
  const sourceIdExpression = createBinarySortExpression(shareLinks.id);
  const cursorPredicate = buildCursorPredicate({
    cursor: input.cursor,
    occurredAtExpression: input.occurredAtExpression,
    sourceIdExpression,
    sourceKindRank: getActivitySourceKindRank(input.kind),
  });
  const rawResult = await db.execute(sql`
    SELECT
      ${shareLinks.id} AS sourceId,
      ${input.occurredAtExpression} AS occurredAt,
      ${shareLinks.file_id} AS fileId,
      ${shareLinks.folder_id} AS folderId,
      ${files.name} AS fileName,
      ${files.deleted_at} AS fileDeletedAt,
      ${folders.name} AS folderName,
      ${folders.deleted_at} AS folderDeletedAt
    FROM ${shareLinks}
    LEFT JOIN ${files}
      ON ${files.id} = ${shareLinks.file_id}
      AND ${files.user_id} = ${shareLinks.created_by}
    LEFT JOIN ${folders}
      ON ${folders.id} = ${shareLinks.folder_id}
      AND ${folders.user_id} = ${shareLinks.created_by}
    WHERE ${shareLinks.created_by} = ${input.userId}
      AND ${input.requiredTimestampClause}
      AND ${cursorPredicate}
    ORDER BY ${input.occurredAtExpression} DESC, ${sourceIdExpression} DESC
    LIMIT ${input.limit}
  `);

  return unwrapSelectRows(rawResult)
    .map((row) => mapShareActivityRow(row, input.kind))
    .filter((entry): entry is ActivityFeedEntry => entry !== null);
}

async function loadShareAccessedActivity(input: {
  cursor: ActivityCursor | null;
  limit: number;
  userId: string;
}) {
  const db = MariadbConnection.getConnection();
  const sourceIdExpression = createBinarySortExpression(shareLinkAccessLogs.id);
  const cursorPredicate = buildCursorPredicate({
    cursor: input.cursor,
    occurredAtExpression: shareLinkAccessLogs.accessed_at,
    sourceIdExpression,
    sourceKindRank: getActivitySourceKindRank("share_accessed"),
  });
  const rawResult = await db.execute(sql`
    SELECT
      ${shareLinkAccessLogs.id} AS sourceId,
      ${shareLinkAccessLogs.accessed_at} AS occurredAt,
      ${shareLinkAccessLogs.email} AS actorLabel,
      ${shareLinks.file_id} AS fileId,
      ${shareLinks.folder_id} AS folderId,
      ${files.name} AS fileName,
      ${files.deleted_at} AS fileDeletedAt,
      ${folders.name} AS folderName,
      ${folders.deleted_at} AS folderDeletedAt
    FROM ${shareLinks}
    INNER JOIN ${shareLinkAccessLogs}
      ON ${shareLinkAccessLogs.link_id} = ${shareLinks.id}
    LEFT JOIN ${files}
      ON ${files.id} = ${shareLinks.file_id}
      AND ${files.user_id} = ${shareLinks.created_by}
    LEFT JOIN ${folders}
      ON ${folders.id} = ${shareLinks.folder_id}
      AND ${folders.user_id} = ${shareLinks.created_by}
    WHERE ${shareLinks.created_by} = ${input.userId}
      AND ${cursorPredicate}
    ORDER BY ${shareLinkAccessLogs.accessed_at} DESC, ${sourceIdExpression} DESC
    LIMIT ${input.limit}
  `);

  return unwrapSelectRows(rawResult)
    .map((row) => mapShareActivityRow(row, "share_accessed"))
    .filter((entry): entry is ActivityFeedEntry => entry !== null);
}

function mapUploadCompletedRow(row: unknown): ActivityFeedEntry | null {
  const record = row as UploadActivityRow;
  const sourceId = typeof record?.sourceId === "string" ? record.sourceId : null;
  const occurredAt = parseDate(record?.occurredAt);
  const targetId = typeof record?.targetId === "string" ? record.targetId : null;

  if (!sourceId || !occurredAt) {
    return null;
  }

  const isDeleted = parseNullableDate(record?.fileDeletedAt) !== null;
  const targetLabel = !isDeleted && typeof record?.fileName === "string" && record.fileName
    ? record.fileName
    : DELETED_ITEM_LABEL;

  return {
    actorLabel: "You",
    ctaHref: null,
    ctaLabel: null,
    id: `upload_completed:${sourceId}`,
    kind: "upload_completed",
    occurredAt: occurredAt.toISOString(),
    occurredAtApproximate: parseBooleanFlag(record?.occurredAtApproximate),
    sourceId,
    targetId,
    targetLabel,
    targetType: targetId ? "file" : "unknown",
  };
}

function mapShareActivityRow(
  row: unknown,
  kind: Extract<ActivityEventKind, "share_created" | "share_revoked" | "share_accessed">,
): ActivityFeedEntry | null {
  const record = row as ShareActivityRow;
  const sourceId = typeof record?.sourceId === "string" ? record.sourceId : null;
  const occurredAt = parseDate(record?.occurredAt);

  if (!sourceId || !occurredAt) {
    return null;
  }

  const target = resolveShareTarget(record);

  return {
    actorLabel:
      kind === "share_accessed"
        ? typeof record.actorLabel === "string" && record.actorLabel.trim()
          ? record.actorLabel.trim()
          : null
        : "You",
    ctaHref: null,
    ctaLabel: null,
    id: `${kind}:${sourceId}`,
    kind,
    occurredAt: occurredAt.toISOString(),
    occurredAtApproximate: false,
    sourceId,
    targetId: target.targetId,
    targetLabel: target.targetLabel,
    targetType: target.targetType,
  };
}

function resolveShareTarget(record: ShareActivityRow): {
  targetId: string | null;
  targetLabel: string;
  targetType: ActivityTargetType;
} {
  if (typeof record.fileId === "string" && record.fileId.length > 0) {
    const isDeleted = parseNullableDate(record.fileDeletedAt) !== null;
    const label = typeof record.fileName === "string" && record.fileName.length > 0
      ? record.fileName
      : null;

    return {
      targetId: record.fileId,
      targetLabel: !isDeleted && label ? label : DELETED_ITEM_LABEL,
      targetType: "file",
    };
  }

  if (typeof record.folderId === "string" && record.folderId.length > 0) {
    const isDeleted = parseNullableDate(record.folderDeletedAt) !== null;
    const label = typeof record.folderName === "string" && record.folderName.length > 0
      ? record.folderName
      : null;

    return {
      targetId: record.folderId,
      targetLabel: !isDeleted && label ? label : DELETED_ITEM_LABEL,
      targetType: "folder",
    };
  }

  return {
    targetId: null,
    targetLabel: DELETED_ITEM_LABEL,
    targetType: "unknown",
  };
}

function buildCursorPredicate(input: {
  cursor: ActivityCursor | null;
  occurredAtExpression: SQLWrapper;
  sourceIdExpression: SQLWrapper;
  sourceKindRank: number;
}) {
  if (!input.cursor) {
    return sql`1 = 1`;
  }

  const cursorOccurredAt = new Date(input.cursor.occurredAt);

  return sql`
    (
      ${input.occurredAtExpression} < ${cursorOccurredAt}
      OR (
        ${input.occurredAtExpression} = ${cursorOccurredAt}
        AND (
          ${input.sourceKindRank} < ${input.cursor.sourceKindRank}
          OR (
            ${input.sourceKindRank} = ${input.cursor.sourceKindRank}
            AND ${input.sourceIdExpression} < ${input.cursor.sourceId}
          )
        )
      )
    )
  `;
}

function createBinarySortExpression(expression: SQLWrapper) {
  return sql`convert(${expression} using utf8mb4) collate utf8mb4_bin`;
}

function unwrapSelectRows(result: unknown): unknown[] {
  if (!Array.isArray(result)) {
    return [];
  }

  const [rows] = result;

  if (Array.isArray(rows)) {
    return rows;
  }

  return result;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const normalizedValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function parseNullableDate(value: unknown): Date | null {
  if (value == null) {
    return null;
  }

  return parseDate(value);
}

function parseBooleanFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return value === "1" || value.toLowerCase() === "true";
  }

  return false;
}

export const ACTIVITY_FEED_PAGE_SIZE = DEFAULT_ACTIVITY_PAGE_SIZE;
export const UPLOAD_COMPLETION_REPAIR_SQL = `
UPDATE files
SET upload_completed_at = created_at,
    upload_completed_at_approximate = 1
WHERE status = 'ready'
  AND upload_completed_at IS NULL;
`.trim();
