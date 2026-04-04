import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import {
  moveFolder,
  renameFolder,
  softDeleteFolder,
} from "@/app/api/files/service";

function createFolderRow(overrides: Partial<{
  createdAt: Date;
  deletedAt: Date | null;
  id: string;
  name: string;
  parentId: string | null;
}> = {}) {
  return {
    createdAt: new Date("2026-03-20T00:00:00.000Z"),
    deletedAt: null,
    id: "folder-1",
    name: "Projects",
    parentId: null,
    ...overrides,
  };
}

function createDbHarness(options: {
  insertResult?: unknown;
  selectResults?: unknown[][];
  updateResults?: Array<{ affectedRows?: number; rowsAffected?: number } | Error>;
}) {
  const insertResult = options.insertResult ?? {};
  const selectQueue = [...(options.selectResults ?? [])];
  const updateQueue = [...(options.updateResults ?? [])];
  const updateWhere = vi.fn(async () => {
    const nextResult = updateQueue.shift();

    if (nextResult instanceof Error) {
      throw nextResult;
    }

    return nextResult ?? { affectedRows: 0 };
  });
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
  const db = {
    insert,
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
      insert,
      insertValues,
      select,
      selectFrom,
      selectWhere: selectFromWhere,
      selectLimit,
      transaction: db.transaction,
      update,
      updateSet,
      updateWhere,
    },
  };
}

describe("folder service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  describe("renameFolder", () => {
    it("sanitizes the folder name before renaming and returns the updated folder", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ name: "Projects" })],
          [createFolderRow({ name: "My Docs" })],
        ],
        updateResults: [{ affectedRows: 1 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      const result = await renameFolder("user-a", "folder-1", "  ./My Docs?  ");

      expect(harness.spies.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My Docs" }),
      );
      expect(result.name).toBe("My Docs");
    });

    it("treats a no-op rename as success when the folder already has that name", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ name: "Projects" })],
          [createFolderRow({ name: "Projects" })],
        ],
        updateResults: [{ affectedRows: 0 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(renameFolder("user-a", "folder-1", "Projects")).resolves.toEqual(
        expect.objectContaining({ id: "folder-1", name: "Projects" }),
      );
      expect(harness.spies.update).toHaveBeenCalledTimes(1);
    });

    it("treats a repeated rename as success when another request already applied it", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ name: "Projects" })],
          [createFolderRow({ name: "Archives" })],
        ],
        updateResults: [{ affectedRows: 0 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(renameFolder("user-a", "folder-1", "Archives")).resolves.toEqual(
        expect.objectContaining({ id: "folder-1", name: "Archives" }),
      );
    });

    it("rejects rename when the folder is outside the caller scope", async () => {
      const harness = createDbHarness({
        selectResults: [[]],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(renameFolder("user-a", "foreign-folder", "Projects")).rejects.toThrow(
        "Folder not found",
      );
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("rejects rename for a soft-deleted folder", async () => {
      const harness = createDbHarness({
        selectResults: [[createFolderRow({ deletedAt: new Date("2026-03-21T00:00:00.000Z") })]],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(renameFolder("user-a", "folder-1", "Projects")).rejects.toThrow(
        "Folder not found",
      );
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("rejects names that collapse to empty after sanitization", async () => {
      const harness = createDbHarness({});
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(renameFolder("user-a", "folder-1", "../???")).rejects.toThrow(
        "Folder name is required",
      );
      expect(harness.spies.select).not.toHaveBeenCalled();
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("rejects overly long names before looking up the folder", async () => {
      const longName = "a".repeat(256);
      const harness = createDbHarness({});
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(renameFolder("user-a", "folder-1", longName)).rejects.toThrow(
        "Name too long",
      );
      expect(harness.spies.select).not.toHaveBeenCalled();
      expect(harness.spies.update).not.toHaveBeenCalled();
    });
  });

  describe("softDeleteFolder", () => {
    it("deletes a single folder with no descendants or files", async () => {
      const harness = createDbHarness({
        selectResults: [[createFolderRow()]],
        updateResults: [{ affectedRows: 1 }, { affectedRows: 0 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-a", "folder-1")).resolves.toEqual({
        deletedFiles: 0,
        deletedFolders: 1,
      });
    });

    it("cascades through direct child folders", async () => {
      const harness = createDbHarness({
        selectResults: [[
          createFolderRow({ id: "parent", name: "Parent" }),
          createFolderRow({ id: "child", name: "Child", parentId: "parent" }),
        ]],
        updateResults: [{ affectedRows: 2 }, { affectedRows: 0 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-a", "parent")).resolves.toEqual({
        deletedFiles: 0,
        deletedFolders: 2,
      });
    });

    it("cascades recursively through a deeply nested folder tree", async () => {
      const harness = createDbHarness({
        selectResults: [[
          createFolderRow({ id: "root", name: "Root" }),
          createFolderRow({ id: "mid", name: "Mid", parentId: "root" }),
          createFolderRow({ id: "leaf", name: "Leaf", parentId: "mid" }),
        ]],
        updateResults: [{ affectedRows: 3 }, { affectedRows: 0 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-a", "root")).resolves.toEqual({
        deletedFiles: 0,
        deletedFolders: 3,
      });
    });

    it("soft-deletes files inside the deleted subtree", async () => {
      const harness = createDbHarness({
        selectResults: [[createFolderRow()]],
        updateResults: [{ affectedRows: 1 }, { affectedRows: 2 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-a", "folder-1")).resolves.toEqual({
        deletedFiles: 2,
        deletedFolders: 1,
      });
      expect(harness.spies.transaction).toHaveBeenCalledTimes(1);
    });

    it("does not count sibling-folder files in the deleted subtree", async () => {
      const harness = createDbHarness({
        selectResults: [[
          createFolderRow({ id: "projects", name: "Projects" }),
          createFolderRow({ id: "taxes", name: "Taxes", parentId: "projects" }),
          createFolderRow({ id: "archive", name: "Archive" }),
        ]],
        updateResults: [{ affectedRows: 2 }, { affectedRows: 1 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-a", "projects")).resolves.toEqual({
        deletedFiles: 1,
        deletedFolders: 2,
      });
      expect(harness.spies.update).toHaveBeenCalledTimes(2);
    });

    it("surfaces a failure when the file cascade update fails inside the transaction", async () => {
      const harness = createDbHarness({
        selectResults: [[createFolderRow()]],
        updateResults: [{ affectedRows: 1 }, new Error("file delete failed")],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-a", "folder-1")).rejects.toThrow(
        "file delete failed",
      );
      expect(harness.spies.transaction).toHaveBeenCalledTimes(1);
      expect(harness.spies.update).toHaveBeenCalledTimes(2);
    });

    it("does not error when deleting a folder that is already deleted", async () => {
      const harness = createDbHarness({
        selectResults: [[createFolderRow({ deletedAt: new Date("2026-03-21T00:00:00.000Z") })]],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-a", "folder-1")).resolves.toEqual({
        deletedFiles: 0,
        deletedFolders: 0,
      });
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("rejects deletes for folders outside the caller scope", async () => {
      const harness = createDbHarness({
        selectResults: [[]],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-a", "foreign-folder")).rejects.toThrow(
        "Folder not found",
      );
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("does not delete another user's folder when ids overlap across users", async () => {
      const harness = createDbHarness({
        selectResults: [[]],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(softDeleteFolder("user-b", "folder-1")).rejects.toThrow("Folder not found");
      expect(harness.spies.transaction).not.toHaveBeenCalled();
      expect(harness.spies.update).not.toHaveBeenCalled();
    });
  });

  describe("moveFolder", () => {
    it("moves a folder into a valid sibling destination", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ id: "folder-a", name: "Projects" })],
          [createFolderRow({ id: "folder-b", name: "Archive" })],
          [
            createFolderRow({ id: "folder-a", name: "Projects" }),
            createFolderRow({ id: "folder-b", name: "Archive" }),
          ],
          [createFolderRow({ id: "folder-a", name: "Projects", parentId: "folder-b" })],
        ],
        updateResults: [{ affectedRows: 1 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      const result = await moveFolder("user-a", "folder-a", "folder-b");

      expect(harness.spies.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ parent_id: "folder-b" }),
      );
      expect(result.parentId).toBe("folder-b");
    });

    it("moves a folder to the root without checking destination ownership", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ id: "folder-a", parentId: "folder-b" })],
          [createFolderRow({ id: "folder-a", parentId: null })],
        ],
        updateResults: [{ affectedRows: 1 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      const result = await moveFolder("user-a", "folder-a", null);

      expect(result.parentId).toBeNull();
      expect(harness.spies.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ parent_id: null }),
      );
    });

    it("treats a zero-row update as success when the folder already reflects the target parent", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ id: "folder-a", parentId: null })],
          [createFolderRow({ id: "folder-b", parentId: null })],
          [
            createFolderRow({ id: "folder-a", parentId: null }),
            createFolderRow({ id: "folder-b", parentId: null }),
          ],
          [createFolderRow({ id: "folder-a", parentId: "folder-b" })],
        ],
        updateResults: [{ affectedRows: 0 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(moveFolder("user-a", "folder-a", "folder-b")).resolves.toEqual(
        expect.objectContaining({ id: "folder-a", parentId: "folder-b" }),
      );
    });

    it("returns the moved folder when the update succeeds but the follow-up read misses", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ id: "folder-a", name: "Projects", parentId: null })],
          [createFolderRow({ id: "folder-b", name: "Archive", parentId: null })],
          [
            createFolderRow({ id: "folder-a", name: "Projects", parentId: null }),
            createFolderRow({ id: "folder-b", name: "Archive", parentId: null }),
          ],
          [],
        ],
        updateResults: [{ affectedRows: 1 }],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(moveFolder("user-a", "folder-a", "folder-b")).resolves.toEqual(
        expect.objectContaining({ id: "folder-a", name: "Projects", parentId: "folder-b" }),
      );
    });

    it("rejects direct self-moves", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ id: "folder-a" })],
          [createFolderRow({ id: "folder-a" })],
          [createFolderRow({ id: "folder-a" })],
        ],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(moveFolder("user-a", "folder-a", "folder-a")).rejects.toThrow(
        "Cannot move a folder into itself or one of its descendants",
      );
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("rejects indirect circular moves into a descendant", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ id: "a", name: "A" })],
          [createFolderRow({ id: "c", name: "C", parentId: "b" })],
          [
            createFolderRow({ id: "a", name: "A" }),
            createFolderRow({ id: "b", name: "B", parentId: "a" }),
            createFolderRow({ id: "c", name: "C", parentId: "b" }),
          ],
        ],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(moveFolder("user-a", "a", "c")).rejects.toThrow(
        "Cannot move a folder into itself or one of its descendants",
      );
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("rejects moves into folders outside the caller scope", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ id: "folder-a" })],
          [],
        ],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(moveFolder("user-a", "folder-a", "foreign-folder")).rejects.toThrow(
        "Folder not found",
      );
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("rejects moves of deleted folders", async () => {
      const harness = createDbHarness({
        selectResults: [[createFolderRow({ deletedAt: new Date("2026-03-21T00:00:00.000Z") })]],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(moveFolder("user-a", "folder-a", null)).rejects.toThrow("Folder not found");
      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("rejects circular moves when the destination is a direct child", async () => {
      const harness = createDbHarness({
        selectResults: [
          [createFolderRow({ id: "b", name: "B" })],
          [createFolderRow({ id: "a", name: "A", parentId: "b" })],
          [
            createFolderRow({ id: "b", name: "B" }),
            createFolderRow({ id: "a", name: "A", parentId: "b" }),
          ],
        ],
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(moveFolder("user-a", "b", "a")).rejects.toThrow(
        "Cannot move a folder into itself or one of its descendants",
      );
      expect(harness.spies.update).not.toHaveBeenCalled();
    });
  });
});
