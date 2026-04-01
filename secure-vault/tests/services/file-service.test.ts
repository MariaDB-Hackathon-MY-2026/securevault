import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import {
  MAX_BULK_FILE_IDS,
  bulkSoftDelete,
  createFolder,
  getFileById,
  getStorageUsage,
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
  insertResult?: unknown;
  selectResults?: unknown[][];
  updateResults?: Array<{ affectedRows?: number; rowsAffected?: number }>;
}) {
  const insertResult = options.insertResult ?? {};
  const selectQueue = [...(options.selectResults ?? [])];
  const updateQueue = [...(options.updateResults ?? [])];
  const updateWhere = vi.fn(async () => updateQueue.shift() ?? { affectedRows: 0 });
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const insertValues = vi.fn(async () => insertResult);
  const insert = vi.fn(() => ({ values: insertValues }));
  const selectLimit = vi.fn(async () => selectQueue.shift() ?? []);
  const selectOrderBy = vi.fn(async () => selectQueue.shift() ?? []);
  const selectWhere = vi.fn(async () => selectQueue.shift() ?? []);
  const selectWhereResult = {
    limit: selectLimit,
    orderBy: selectOrderBy,
    then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      selectWhere().then(onFulfilled, onRejected),
  };
  const selectFromWhere = vi.fn(() => selectWhereResult);
  const selectFrom = vi.fn(() => ({
    where: selectFromWhere,
  }));
  const select = vi.fn(() => ({
    from: selectFrom,
  }));

  return {
    db: {
      insert,
      select,
      update,
    },
    spies: {
      insert,
      insertValues,
      select,
      selectFrom,
      selectWhere: selectFromWhere,
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

  it("treats a no-op rename as success when the file already has the sanitized name", async () => {
    const sanitizedName = "crab_nasa.png";
    const harness = createDbHarness({
      selectResults: [[createFileRow({ name: sanitizedName })]],
      updateResults: [{ affectedRows: 0 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(renameFile("user-a", "file-1", sanitizedName)).resolves.toEqual(
      expect.objectContaining({ id: "file-1", name: sanitizedName }),
    );
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

  it("returns zero affected rows immediately for empty bulk deletes", async () => {
    const harness = createDbHarness({});
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(bulkSoftDelete("user-a", [])).resolves.toEqual({ affectedCount: 0 });

    expect(harness.spies.update).not.toHaveBeenCalled();
  });

  it("rejects bulk deletes that exceed the maximum size", async () => {
    const harness = createDbHarness({});
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      bulkSoftDelete("user-a", Array.from({ length: MAX_BULK_FILE_IDS + 1 }, (_, index) => `file-${index}`)),
    ).rejects.toThrow(`Cannot bulk-delete more than ${MAX_BULK_FILE_IDS} files at once`);

    expect(harness.spies.update).not.toHaveBeenCalled();
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

  it("moves a file to the root without checking folder ownership", async () => {
    const harness = createDbHarness({
      selectResults: [[createFileRow({ folderId: null })]],
      updateResults: [{ affectedRows: 1 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await moveFile("user-a", "file-1", null);

    expect(harness.spies.select).toHaveBeenCalledTimes(1);
    expect(harness.spies.updateSet).toHaveBeenCalledWith(expect.objectContaining({ folder_id: null }));
    expect(result.folderId).toBeNull();
  });

  it("treats a no-op move as success when the file already has the target folder", async () => {
    const harness = createDbHarness({
      selectResults: [[{ id: "folder-1" }], [createFileRow({ folderId: "folder-1" })]],
      updateResults: [{ affectedRows: 0 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(moveFile("user-a", "file-1", "folder-1")).resolves.toEqual(
      expect.objectContaining({ id: "file-1", folderId: "folder-1" }),
    );
  });

  it("treats a repeated soft delete as success when the file is already deleted", async () => {
    const deletedAt = new Date("2026-03-21T00:00:00.000Z");
    const harness = createDbHarness({
      selectResults: [[{ ...createFileRow(), deletedAt }]],
      updateResults: [{ affectedRows: 0 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(softDeleteFile("user-a", "file-1")).resolves.toEqual({
      deletedAt: deletedAt.toISOString(),
      fileId: "file-1",
    });
  });

  it("creates a folder with a sanitized name", async () => {
    const harness = createDbHarness({});
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await createFolder("user-a", "  ./Projects?  ", null);

    expect(harness.spies.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Projects",
        parent_id: null,
        user_id: "user-a",
      }),
    );
    expect(result.name).toBe("Projects");
  });

  it("rejects folder creation when the parent belongs to another user or is deleted", async () => {
    const harness = createDbHarness({
      selectResults: [[]],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(createFolder("user-a", "Projects", "foreign-folder")).rejects.toThrow(
      "Folder not found",
    );
    expect(harness.spies.insert).not.toHaveBeenCalled();
  });

  it("counts only ready, non-deleted files in storage usage", async () => {
    const harness = createDbHarness({
      selectResults: [[{ fileCount: 2, totalBytes: 4096 }]],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(getStorageUsage("user-a")).resolves.toEqual({
      fileCount: 2,
      totalBytes: 4096,
    });

    expect(harness.spies.selectWhere).toHaveBeenCalledTimes(1);
  });

  it("returns zero storage usage when the aggregate query has no row", async () => {
    const harness = createDbHarness({
      selectResults: [[]],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(getStorageUsage("user-a")).resolves.toEqual({
      fileCount: 0,
      totalBytes: 0,
    });
  });
});
