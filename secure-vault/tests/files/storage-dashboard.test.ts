import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import {
  buildStorageDashboardData,
  calculateUsagePercent,
  getStorageDashboardData,
} from "@/lib/files/storage-dashboard";

function createReadyFileRow(
  overrides: Partial<{
    deletedAt: Date | null;
    folderId: string | null;
    id: string;
    mimeType: string;
    name: string;
    size: number;
    updatedAt: Date;
  }> = {},
) {
  return {
    deletedAt: null,
    folderId: null,
    id: "file-1",
    mimeType: "application/pdf",
    name: "report.pdf",
    size: 1024,
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createDbHarness(selectResults: unknown[][]) {
  const queue = [...selectResults];
  const selectWhere = vi.fn(async () => queue.shift() ?? []);
  const selectFrom = vi.fn(() => ({
    where: selectWhere,
  }));
  const select = vi.fn(() => ({
    from: selectFrom,
  }));

  return {
    db: {
      select,
    },
    spies: {
      select,
      selectFrom,
      selectWhere,
    },
  };
}

describe("storage dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("builds active, trashed, breakdown, and largest-file metrics from ready files", () => {
    const dashboard = buildStorageDashboardData({
      files: [
        createReadyFileRow({
          id: "doc",
          mimeType: "application/pdf",
          name: "doc.pdf",
          size: 2_048,
          updatedAt: new Date("2026-04-03T00:00:00.000Z"),
        }),
        createReadyFileRow({
          id: "img",
          mimeType: "image/png",
          name: "photo.png",
          size: 4_096,
          updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
        createReadyFileRow({
          deletedAt: new Date("2026-04-04T00:00:00.000Z"),
          id: "trash",
          mimeType: "application/zip",
          name: "archive.zip",
          size: 1_024,
          updatedAt: new Date("2026-04-04T00:00:00.000Z"),
        }),
      ],
      quotaBytes: 10_000,
      quotaUsedBytes: 9_500,
    });

    expect(dashboard.quotaUsedBytes).toBe(9_500);
    expect(dashboard.activeBytes).toBe(6_144);
    expect(dashboard.activeFileCount).toBe(2);
    expect(dashboard.trashedBytes).toBe(1_024);
    expect(dashboard.trashedFileCount).toBe(1);
    expect(dashboard.usagePercent).toBe(95);
    expect(dashboard.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bytes: 2_048,
          category: "documents",
          fileCount: 1,
          percentOfActiveBytes: 33,
        }),
        expect.objectContaining({
          bytes: 4_096,
          category: "images",
          fileCount: 1,
          percentOfActiveBytes: 67,
        }),
        expect.objectContaining({
          bytes: 0,
          category: "archives",
          fileCount: 0,
          percentOfActiveBytes: 0,
        }),
      ]),
    );
    expect(dashboard.largestFiles.map((file) => file.id)).toEqual(["img", "doc"]);
  });

  it("sorts largest files deterministically by size and then updated time", () => {
    const dashboard = buildStorageDashboardData({
      files: [
        createReadyFileRow({
          id: "older",
          size: 4_096,
          updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        }),
        createReadyFileRow({
          id: "newer",
          size: 4_096,
          updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
      ],
      quotaBytes: 1,
      quotaUsedBytes: 0,
    });

    expect(dashboard.largestFiles.map((file) => file.id)).toEqual(["newer", "older"]);
  });

  it("falls back to id ordering when size and updated time are identical", () => {
    const dashboard = buildStorageDashboardData({
      files: [
        createReadyFileRow({
          id: "file-b",
          size: 4_096,
          updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
        createReadyFileRow({
          id: "file-a",
          size: 4_096,
          updatedAt: new Date("2026-04-02T00:00:00.000Z"),
        }),
      ],
      quotaBytes: 1,
      quotaUsedBytes: 0,
    });

    expect(dashboard.largestFiles.map((file) => file.id)).toEqual(["file-a", "file-b"]);
  });

  it("clamps usage percent and avoids divide-by-zero", () => {
    expect(calculateUsagePercent(20, 0)).toBe(0);
    expect(calculateUsagePercent(200, 100)).toBe(100);
    expect(calculateUsagePercent(-10, 100)).toBe(0);
  });

  it("loads dashboard data from the database and uses user.storage_used for quota", async () => {
    const harness = createDbHarness([
      [
        createReadyFileRow({
          id: "ready-1",
          size: 512,
        }),
        createReadyFileRow({
          deletedAt: new Date("2026-04-05T00:00:00.000Z"),
          id: "trashed-1",
          size: 256,
        }),
      ],
    ]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const dashboard = await getStorageDashboardData({
      id: "user-1",
      storage_quota: 4_096,
      storage_used: 3_000,
    } as never);

    expect(harness.spies.selectWhere).toHaveBeenCalledTimes(1);
    expect(dashboard.quotaUsedBytes).toBe(3_000);
    expect(dashboard.activeBytes).toBe(512);
    expect(dashboard.trashedBytes).toBe(256);
  });
});
