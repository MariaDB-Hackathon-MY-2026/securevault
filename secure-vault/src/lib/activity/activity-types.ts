export type ActivityEventKind =
  | "upload_completed"
  | "share_created"
  | "share_revoked"
  | "share_accessed";

export type ActivityTargetType = "file" | "folder" | "unknown";

export type ActivityFeedEntry = {
  id: string;
  sourceId: string;
  occurredAt: string;
  occurredAtApproximate: boolean;
  kind: ActivityEventKind;
  actorLabel: string | null;
  targetId: string | null;
  targetType: ActivityTargetType;
  targetLabel: string;
  ctaHref: string | null;
  ctaLabel: string | null;
};

export type ActivityFeedPage = {
  entries: ActivityFeedEntry[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type ActivityCursor = {
  occurredAt: string;
  sourceId: string;
  sourceKindRank: number;
};

export const ACTIVITY_SOURCE_KIND_RANK: Record<ActivityEventKind, number> = {
  upload_completed: 40,
  share_revoked: 30,
  share_created: 20,
  share_accessed: 10,
};
export const MAX_ACTIVITY_CURSOR_LENGTH = 512;

const VALID_SOURCE_KIND_RANKS = new Set(Object.values(ACTIVITY_SOURCE_KIND_RANK));

export function getActivitySourceKindRank(kind: ActivityEventKind) {
  return ACTIVITY_SOURCE_KIND_RANK[kind];
}

export function createActivityCursorFromEntry(entry: ActivityFeedEntry): ActivityCursor {
  return {
    occurredAt: entry.occurredAt,
    sourceId: entry.sourceId,
    sourceKindRank: getActivitySourceKindRank(entry.kind),
  };
}

export function serializeActivityCursor(cursor: ActivityCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function parseActivityCursor(value: string | null | undefined): ActivityCursor | null {
  if (!value) {
    return null;
  }

  if (value.length > MAX_ACTIVITY_CURSOR_LENGTH) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ActivityCursor>;

    if (
      typeof parsed.occurredAt !== "string"
      || Number.isNaN(new Date(parsed.occurredAt).getTime())
      || typeof parsed.sourceId !== "string"
      || parsed.sourceId.length === 0
      || typeof parsed.sourceKindRank !== "number"
      || !VALID_SOURCE_KIND_RANKS.has(parsed.sourceKindRank)
    ) {
      return null;
    }

    return {
      occurredAt: parsed.occurredAt,
      sourceId: parsed.sourceId,
      sourceKindRank: parsed.sourceKindRank,
    };
  } catch {
    return null;
  }
}

export function compareActivityFeedEntries(left: ActivityFeedEntry, right: ActivityFeedEntry) {
  const leftTime = new Date(left.occurredAt).getTime();
  const rightTime = new Date(right.occurredAt).getTime();

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const leftRank = getActivitySourceKindRank(left.kind);
  const rightRank = getActivitySourceKindRank(right.kind);

  if (leftRank !== rightRank) {
    return rightRank - leftRank;
  }

  return compareActivitySourceIdsDesc(left.sourceId, right.sourceId);
}

export function compareActivitySourceIdsDesc(leftSourceId: string, rightSourceId: string) {
  if (leftSourceId === rightSourceId) {
    return 0;
  }

  return leftSourceId < rightSourceId ? 1 : -1;
}
