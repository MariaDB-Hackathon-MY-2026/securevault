import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import {
  escapeLikePattern,
  getFilenameSearchRank,
  normalizeFilenameSearchQuery,
  searchFilesByFilename,
} from "@/lib/search/filename-search";

function createDbHarness(selectResults: unknown[][]) {
  const queue = [...selectResults];
  const limit = vi.fn(async () => queue.shift() ?? []);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({
    orderBy,
    then: (
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(queue.shift() ?? []).then(onFulfilled, onRejected),
  }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    db: {
      select,
    },
    spies: {
      limit,
      orderBy,
      select,
      where,
    },
  };
}

describe("filename search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("normalizes queries and escapes SQL wildcard characters", () => {
    expect(normalizeFilenameSearchQuery("  Quarterly Report  ")).toBe("quarterly report");
    expect(escapeLikePattern("100%_done\\final")).toBe("100\\%\\_done\\\\final");
  });

  it("ranks exact, prefix, substring, and non-matches in order", () => {
    expect(getFilenameSearchRank("report.pdf", "report.pdf")).toBe(0);
    expect(getFilenameSearchRank("report-v2.pdf", "report")).toBe(1);
    expect(getFilenameSearchRank("quarterly-report.pdf", "report")).toBe(2);
    expect(getFilenameSearchRank("notes.txt", "report")).toBe(3);
  });

  it("builds folder breadcrumbs, keeps root files explicit, and caps the limit", async () => {
    const harness = createDbHarness([
      [
        {
          folderId: "child-folder",
          id: "file-1",
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 2048,
          updatedAt: new Date("2026-04-07T00:00:00.000Z"),
        },
        {
          folderId: null,
          id: "file-2",
          mimeType: "image/png",
          name: "root-image.png",
          size: 512,
          updatedAt: new Date("2026-04-06T00:00:00.000Z"),
        },
      ],
      [
        { id: "root-folder", name: "Projects", parentId: null },
        { id: "child-folder", name: "Q1", parentId: "root-folder" },
      ],
    ]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const results = await searchFilesByFilename({
      limit: 999,
      query: "report",
      userId: "user-1",
    });

    expect(harness.spies.limit).toHaveBeenCalledWith(50);
    expect(results).toEqual([
      {
        folderId: "child-folder",
        folderPath: [
          { id: "root-folder", name: "Projects" },
          { id: "child-folder", name: "Q1" },
        ],
        id: "file-1",
        isInRoot: false,
        mimeType: "application/pdf",
        name: "report.pdf",
        size: 2048,
        updatedAt: "2026-04-07T00:00:00.000Z",
      },
      {
        folderId: null,
        folderPath: [],
        id: "file-2",
        isInRoot: true,
        mimeType: "image/png",
        name: "root-image.png",
        size: 512,
        updatedAt: "2026-04-06T00:00:00.000Z",
      },
    ]);
  });
});
