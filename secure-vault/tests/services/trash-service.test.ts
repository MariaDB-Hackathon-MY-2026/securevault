import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  listObjects: vi.fn(),
}));

vi.mock("@/lib/storage/r2", () => ({
  deleteObject: storageMocks.deleteObject,
  listObjects: storageMocks.listObjects,
}));

import { MariadbConnection } from "@/lib/db";
import {
  cleanupExpiredUploads,
  emptyTrash,
  listTrashForUser,
  permanentlyDeleteFile,
  restoreFile,
} from "@/app/api/files/service";

function createFileRow(overrides: Partial<{
  createdAt: Date;
  deletedAt: Date | null;
  folderId: string | null;
  id: string;
  mimeType: string;
  name: string;
  size: number;
  status: "failed" | "ready" | "uploading";
  thumbnailR2Key: string | null;
  updatedAt: Date;
  userId: string;
}> = {}) {
  return {
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    deletedAt: new Date("2026-04-02T00:00:00.000Z"),
    folderId: null,
    id: "file-1",
    mimeType: "application/pdf",
    name: "report.pdf",
    size: 1024,
    status: "ready" as const,
    thumbnailR2Key: null,
    updatedAt: new Date("2026-04-02T00:00:00.000Z"),
    userId: "user-a",
    ...overrides,
  };
}

function createFolderRow(overrides: Partial<{
  createdAt: Date;
  deletedAt: Date | null;
  id: string;
  name: string;
  parentId: string | null;
  userId: string;
}> = {}) {
  return {
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    deletedAt: null,
    id: "folder-1",
    name: "Projects",
    parentId: null,
    userId: "user-a",
    ...overrides,
  };
}

function createDbHarness(options: {
  deleteResults?: Array<{ affectedRows?: number; rowsAffected?: number }>;
  selectResults?: unknown[][];
  updateResults?: Array<{ affectedRows?: number; rowsAffected?: number }>;
}) {
  const selectQueue = [...(options.selectResults ?? [])];
  const updateQueue = [...(options.updateResults ?? [])];
  const deleteQueue = [...(options.deleteResults ?? [])];
  const consumeSelect = async () => selectQueue.shift() ?? [];
  const selectChain = {
    limit: vi.fn(async () => consumeSelect()),
    orderBy: vi.fn(() => selectChain),
    then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      consumeSelect().then(onFulfilled, onRejected),
  };
  const selectWhere = vi.fn(() => selectChain);
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateWhere = vi.fn(async () => updateQueue.shift() ?? { affectedRows: 0 });
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn(async () => deleteQueue.shift() ?? { affectedRows: 0 });
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  const db = {
    delete: deleteFn,
    select,
    transaction: vi.fn(),
    update,
  };

  db.transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) =>
    callback(db),
  );

  return {
    db,
    spies: {
      delete: deleteFn,
      deleteWhere,
      select,
      selectFrom,
      selectWhere,
      transaction: db.transaction,
      update,
      updateSet,
      updateWhere,
    },
  };
}

describe("trash service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.deleteObject.mockResolvedValue({});
    storageMocks.listObjects.mockResolvedValue({ Contents: [] });
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("lists root deleted files and folders while excluding descendants under deleted folders", async () => {
    const deletedAt = new Date("2026-04-02T00:00:00.000Z");
    const harness = createDbHarness({
      selectResults: [[
        createFolderRow({ id: "deleted-root", deletedAt, name: "Projects" }),
        createFolderRow({ id: "nested-deleted", deletedAt, name: "Taxes", parentId: "deleted-root" }),
        createFolderRow({ id: "active-parent", deletedAt: null, name: "Inbox" }),
      ], [
        createFileRow({ id: "standalone-file", deletedAt, folderId: null, name: "solo.pdf", size: 256 }),
        createFileRow({ id: "nested-file", deletedAt, folderId: "deleted-root", name: "taxes.pdf", size: 512 }),
        createFileRow({ id: "active-folder-file", deletedAt, folderId: "active-parent", name: "invoice.pdf", size: 128 }),
      ], [
        createFolderRow({ id: "deleted-root", deletedAt, name: "Projects" }),
        createFolderRow({ id: "nested-deleted", deletedAt, name: "Taxes", parentId: "deleted-root" }),
      ]],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await listTrashForUser("user-a");

    expect(result.summary).toEqual({
      rootFileCount: 2,
      rootFolderCount: 1,
      totalRootItemCount: 3,
    });
    expect(result.items.map((item) => item.id)).toEqual([
      "deleted-root",
      "standalone-file",
      "active-folder-file",
    ]);
    expect(result.items.find((item) => item.id === "deleted-root")).toEqual(
      expect.objectContaining({
        descendantFileCount: 1,
        descendantFolderCount: 1,
        kind: "folder",
        totalBytes: 512,
      }),
    );
  });

  it("rejects file restore when the parent folder is still deleted", async () => {
    const harness = createDbHarness({
      selectResults: [[createFileRow({ folderId: "folder-1" })], [createFolderRow({
        deletedAt: new Date("2026-04-01T00:00:00.000Z"),
      })]],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(restoreFile("user-a", "file-1")).rejects.toThrow("Restore the parent folder first");
    expect(harness.spies.update).not.toHaveBeenCalled();
  });

  it("permanently deletes a trashed ready file, removes share links, and reclaims quota", async () => {
    const harness = createDbHarness({
      deleteResults: [{ affectedRows: 1 }, { affectedRows: 1 }],
      selectResults: [
        [createFileRow({ thumbnailR2Key: "thumb-key" })],
        [createFileRow({ thumbnailR2Key: "thumb-key" })],
        [{ fileId: "file-1", r2Key: "user-a/files/file-1/chunk_0" }],
      ],
      updateResults: [{ affectedRows: 1 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(permanentlyDeleteFile("user-a", "file-1")).resolves.toEqual({
      deletedFiles: 1,
      deletedFolders: 0,
      reclaimedBytes: 1024,
    });

    expect(harness.spies.delete).toHaveBeenCalledTimes(2);
    expect(harness.spies.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        storage_used: expect.anything(),
      }),
    );
    expect(storageMocks.deleteObject).toHaveBeenCalledWith("user-a/files/file-1/chunk_0");
    expect(storageMocks.deleteObject).toHaveBeenCalledWith("thumb-key");
  });

  it("empties trash without double-counting files that are already represented by a deleted folder root", async () => {
    const deletedAt = new Date("2026-04-02T00:00:00.000Z");
    const harness = createDbHarness({
      deleteResults: [
        { affectedRows: 0 },
        { affectedRows: 0 },
        { affectedRows: 2 },
        { affectedRows: 2 },
      ],
      selectResults: [
        [
          createFolderRow({ id: "deleted-root", deletedAt, name: "Projects" }),
          createFolderRow({ id: "child", deletedAt, name: "Taxes", parentId: "deleted-root" }),
        ],
        [
          createFileRow({ id: "standalone-file", deletedAt, folderId: null, size: 128 }),
          createFileRow({ id: "nested-file", deletedAt, folderId: "deleted-root", size: 512 }),
        ],
        [createFolderRow({ id: "deleted-root", deletedAt, name: "Projects" })],
        [
          createFolderRow({ id: "deleted-root", deletedAt, name: "Projects" }),
          createFolderRow({ id: "child", deletedAt, name: "Taxes", parentId: "deleted-root" }),
        ],
        [
          createFileRow({ id: "standalone-file", deletedAt, folderId: null, size: 128 }),
          createFileRow({ id: "nested-file", deletedAt, folderId: "deleted-root", size: 512 }),
        ],
        [],
      ],
      updateResults: [{ affectedRows: 1 }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(emptyTrash("user-a")).resolves.toEqual({
      deletedFiles: 2,
      deletedFolders: 2,
      reclaimedBytes: 640,
    });

    expect(harness.spies.delete).toHaveBeenCalledTimes(4);
  });

  it("cleans up expired uploads without reclaiming storage quota", async () => {
    const harness = createDbHarness({
      deleteResults: [{ affectedRows: 1 }],
      selectResults: [[
        {
          expiresAt: new Date("2026-04-01T00:00:00.000Z"),
          fileId: "file-1",
          id: "upload-1",
          userId: "user-a",
        },
      ], [createFileRow({ deletedAt: null, status: "uploading" })], []],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(cleanupExpiredUploads(new Date("2026-04-04T00:00:00.000Z"))).resolves.toEqual({
      deletedFiles: 1,
      expiredSessions: 1,
    });

    expect(harness.spies.update).not.toHaveBeenCalled();
    expect(harness.spies.delete).toHaveBeenCalledTimes(1);
  });
});
