import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import { getActivityFeedForUser } from "@/lib/activity/activity-service";
import { parseActivityCursor } from "@/lib/activity/activity-types";

function createExecuteHarness(results: unknown[]) {
  const queue = [...results];
  const execute = vi.fn(async () => queue.shift() ?? [[]]);

  return {
    db: { execute },
    spies: { execute },
  };
}

describe("activity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("merges mixed activity sources in deterministic newest-first order", async () => {
    const harness = createExecuteHarness([
      [[
        {
          fileDeletedAt: null,
          fileName: "legacy-report.pdf",
          occurredAt: "2026-04-10 10:00:00",
          occurredAtApproximate: 1,
          sourceId: "file-1",
          targetId: "file-1",
        },
      ]],
      [[]],
      [[
        {
          fileDeletedAt: null,
          fileId: "file-2",
          fileName: "budget.xlsx",
          occurredAt: "2026-04-10 11:00:00",
          sourceId: "link-2",
        },
      ]],
      [[
        {
          folderDeletedAt: null,
          folderId: "folder-1",
          folderName: "Projects",
          occurredAt: "2026-04-10 11:00:00",
          sourceId: "link-1",
        },
      ]],
      [[
        {
          actorLabel: null,
          fileDeletedAt: "2026-04-10 12:00:00",
          fileId: "file-3",
          fileName: "secret.txt",
          occurredAt: "2026-04-10 11:00:00",
          sourceId: "access-1",
        },
      ]],
    ]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const page = await getActivityFeedForUser({
      pageSize: 3,
      userId: "user-1",
    });

    expect(page.entries.map((entry) => entry.kind)).toEqual([
      "share_revoked",
      "share_created",
      "share_accessed",
    ]);
    expect(page.entries[2]).toMatchObject({
      actorLabel: null,
      occurredAtApproximate: false,
      targetLabel: "Deleted item",
      targetType: "file",
    });
    expect(page.hasMore).toBe(true);
    expect(parseActivityCursor(page.nextCursor)).toEqual({
      occurredAt: "2026-04-10T11:00:00.000Z",
      sourceId: "access-1",
      sourceKindRank: 10,
    });
  });

  it("keeps legacy backfilled uploads marked as approximate after migration backfill", async () => {
    const harness = createExecuteHarness([
      [[
        {
          fileDeletedAt: null,
          fileName: "legacy-report.pdf",
          occurredAt: "2026-04-10 10:00:00",
          occurredAtApproximate: 1,
          sourceId: "file-1",
          targetId: "file-1",
        },
      ]],
      [[]],
      [[]],
      [[]],
      [[]],
    ]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const page = await getActivityFeedForUser({
      pageSize: 1,
      userId: "user-1",
    });

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({
      kind: "upload_completed",
      occurredAtApproximate: true,
      targetLabel: "legacy-report.pdf",
    });
  });

  it("keeps rollout-gap uploads visible via the created_at fallback lane", async () => {
    const harness = createExecuteHarness([
      [[]],
      [[
        {
          fileDeletedAt: null,
          fileName: "repair-me.pdf",
          occurredAt: "2026-04-10 10:00:00",
          occurredAtApproximate: 1,
          sourceId: "file-rollout",
          targetId: "file-rollout",
        },
      ]],
      [[]],
      [[]],
      [[]],
    ]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const page = await getActivityFeedForUser({
      pageSize: 1,
      userId: "user-1",
    });

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({
      kind: "upload_completed",
      occurredAtApproximate: true,
      targetLabel: "repair-me.pdf",
    });
  });

  it("supports paging forward from a cursor without duplicating prior entries", async () => {
    const firstHarness = createExecuteHarness([
      [[
        {
          fileDeletedAt: null,
          fileName: "three.txt",
          occurredAt: "2026-04-10 10:03:00",
          occurredAtApproximate: 0,
          sourceId: "file-3",
          targetId: "file-3",
        },
        {
          fileDeletedAt: null,
          fileName: "two.txt",
          occurredAt: "2026-04-10 10:02:00",
          occurredAtApproximate: 0,
          sourceId: "file-2",
          targetId: "file-2",
        },
        {
          fileDeletedAt: null,
          fileName: "one.txt",
          occurredAt: "2026-04-10 10:01:00",
          occurredAtApproximate: 0,
          sourceId: "file-1",
          targetId: "file-1",
        },
      ]],
      [[]],
      [[]],
      [[]],
      [[]],
    ]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(firstHarness.db as never);

    const firstPage = await getActivityFeedForUser({
      pageSize: 2,
      userId: "user-1",
    });

    expect(firstPage.entries.map((entry) => entry.sourceId)).toEqual(["file-3", "file-2"]);
    expect(firstPage.hasMore).toBe(true);

    const secondHarness = createExecuteHarness([
      [[
        {
          fileDeletedAt: null,
          fileName: "one.txt",
          occurredAt: "2026-04-10 10:01:00",
          occurredAtApproximate: 0,
          sourceId: "file-1",
          targetId: "file-1",
        },
      ]],
      [[]],
      [[]],
      [[]],
      [[]],
    ]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(secondHarness.db as never);

    const secondPage = await getActivityFeedForUser({
      cursor: parseActivityCursor(firstPage.nextCursor)!,
      pageSize: 2,
      userId: "user-1",
    });

    expect(secondPage.entries.map((entry) => entry.sourceId)).toEqual(["file-1"]);
    expect(secondPage.hasMore).toBe(false);
  });

  it("returns empty results cleanly when none of the sources have rows", async () => {
    const harness = createExecuteHarness([[[]], [[]], [[]], [[]], [[]]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const page = await getActivityFeedForUser({
      userId: "user-1",
    });

    expect(page).toEqual({
      entries: [],
      hasMore: false,
      nextCursor: null,
    });
  });
});
