import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import {
  bulkSoftDelete,
  getFileById,
  moveFile,
  renameFile,
  softDeleteFile,
} from "@/app/api/files/service";

function createFileRow(overrides: Partial<{
  createdAt: Date;
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  size: number;
  updatedAt: Date;
}> = {}) {
  return {
    createdAt: new Date("2026-03-20T00:00:00.000Z"),
    folderId: null,
    id: "file-1",
    mimeType: "application/pdf",
    name: "report.pdf",
    size: 1024,
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
    ...overrides,
  };
}

function createDbHarness(options: {
  selectResults?: unknown[][];
  updateResults?: Array<{ affectedRows?: number; rowsAffected?: number }>;
}) {
  const selectQueue = [...(options.selectResults ?? [])];
  const updateQueue = [...(options.updateResults ?? [])];
  const updateWhere = vi.fn(async () => updateQueue.shift() ?? { affectedRows: 0 });
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const selectLimit = vi.fn(async () => selectQueue.shift() ?? []);
  const selectOrderBy = vi.fn(async () => selectQueue.shift() ?? []);
  const selectWhere = vi.fn(() => ({
    limit: selectLimit,
    orderBy: selectOrderBy,
  }));
  const selectFrom = vi.fn(() => ({
    where: selectWhere,
  }));
  const select = vi.fn(() => ({
    from: selectFrom,
  }));

  return {
    db: {
      select,
      update,
    },
    spies: {
      select,
      selectFrom,
      selectWhere,
      selectLimit,
      update,
      updateSet,
      updateWhere,
    },
  };
}

describe("file service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("returns null for getFileById when the scoped lookup finds no record", async () => {
    const harness = createDbHarness({
      selectResults: [[]],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(getFileById("user-a", "other-users-file")).resolves.toBeNull();
    expect(harness.spies.selectLimit).toHaveBeenCalledTimes(1);
  });

  it("sanitizes the filename before rename and returns the updated file", async () => {
    const sanitizedName = "quarterlyreport.pdf";
    const harness = createDbHarness({
      selectResults: [[createFileRow({ name: sanitizedName })]],
      updateResults: [{ affectedRows: 1 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await renameFile("user-a", "file-1", '  quarterly../report?.pdf  ');

    expect(harness.spies.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: sanitizedName }),
    );
    expect(result.name).toBe(sanitizedName);
  });

  it("sets deleted_at when soft deleting a file", async () => {
    const harness = createDbHarness({
      updateResults: [{ affectedRows: 1 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await softDeleteFile("user-a", "file-1");

    const firstSetCall = harness.spies.updateSet.mock.calls[0] as unknown[] | undefined;
    const setCall = firstSetCall?.[0] as { deleted_at?: Date } | undefined;
    expect(setCall?.deleted_at).toBeInstanceOf(Date);
    expect(result.fileId).toBe("file-1");
  });

  it("returns only the affected count for bulk deletes so callers can detect partial ownership", async () => {
    const harness = createDbHarness({
      updateResults: [{ affectedRows: 1 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      bulkSoftDelete("user-a", ["user-a-file", "other-user-file"]),
    ).resolves.toEqual({ affectedCount: 1 });
  });

  it("rejects a move when the destination folder is outside the caller scope", async () => {
    const harness = createDbHarness({
      selectResults: [[]],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(moveFile("user-a", "file-1", "foreign-folder")).rejects.toThrow(
      "Folder not found",
    );
    expect(harness.spies.update).not.toHaveBeenCalled();
  });
});
