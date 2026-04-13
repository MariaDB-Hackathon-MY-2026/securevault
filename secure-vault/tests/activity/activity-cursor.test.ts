import { describe, expect, it } from "vitest";

import {
  compareActivityFeedEntries,
  parseActivityCursor,
  serializeActivityCursor,
  type ActivityFeedEntry,
} from "@/lib/activity/activity-types";

function createEntry(overrides: Partial<ActivityFeedEntry> = {}): ActivityFeedEntry {
  return {
    actorLabel: "You",
    ctaHref: null,
    ctaLabel: null,
    id: "upload_completed:file-1",
    kind: "upload_completed",
    occurredAt: "2026-04-10T10:00:00.000Z",
    occurredAtApproximate: false,
    sourceId: "file-1",
    targetId: "file-1",
    targetLabel: "report.pdf",
    targetType: "file",
    ...overrides,
  };
}

describe("activity cursor helpers", () => {
  it("round-trips a serialized cursor", () => {
    const serialized = serializeActivityCursor({
      occurredAt: "2026-04-10T10:00:00.000Z",
      sourceId: "file-1",
      sourceKindRank: 40,
    });

    expect(parseActivityCursor(serialized)).toEqual({
      occurredAt: "2026-04-10T10:00:00.000Z",
      sourceId: "file-1",
      sourceKindRank: 40,
    });
  });

  it("treats malformed cursor payloads as invalid", () => {
    expect(parseActivityCursor("not-a-cursor")).toBeNull();
    expect(
      parseActivityCursor(
        Buffer.from(
          JSON.stringify({
            occurredAt: "invalid",
            sourceId: "",
            sourceKindRank: 999,
          }),
          "utf8",
        ).toString("base64url"),
      ),
    ).toBeNull();
  });

  it("sorts identical timestamps by explicit source-kind rank instead of enum string order", () => {
    const entries = [
      createEntry({
        id: "share_accessed:access-1",
        kind: "share_accessed",
        sourceId: "access-1",
      }),
      createEntry({
        id: "share_created:link-1",
        kind: "share_created",
        sourceId: "link-1",
      }),
      createEntry({
        id: "share_revoked:link-2",
        kind: "share_revoked",
        sourceId: "link-2",
      }),
    ];

    expect(entries.sort(compareActivityFeedEntries).map((entry) => entry.kind)).toEqual([
      "share_revoked",
      "share_created",
      "share_accessed",
    ]);
  });

  it("falls back to descending source id order when timestamp and source rank match", () => {
    const entries = [
      createEntry({ id: "upload_completed:file-a", sourceId: "file-a" }),
      createEntry({ id: "upload_completed:file-b", sourceId: "file-b" }),
    ];

    expect(entries.sort(compareActivityFeedEntries).map((entry) => entry.sourceId)).toEqual([
      "file-b",
      "file-a",
    ]);
  });
});
