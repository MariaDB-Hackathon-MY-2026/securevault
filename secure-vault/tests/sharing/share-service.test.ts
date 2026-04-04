import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import { files, folders } from "@/lib/db/schema";
import {
  assertShareLinkAccessible,
  requireFolderShareTargetFile,
  requireSharedFileSummary,
  ShareServiceError,
  updateShareLinkSettings,
} from "@/lib/sharing/share-service";

function createSelectHarness(selects: {
  fileRows?: Array<{ folderId: string | null; id: string }>;
  folderRows?: Array<{ id: string; parentId: string | null }>;
}) {
  const fileLimit = vi.fn().mockResolvedValue(selects.fileRows ?? []);
  const fileWhere = vi.fn(() => ({ limit: fileLimit }));
  const folderThen = vi.fn().mockResolvedValue(selects.folderRows ?? []);
  const folderWhereResult = {
    then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      folderThen().then(onFulfilled, onRejected),
  };
  const folderWhere = vi.fn(() => folderWhereResult);

  const selectFrom = vi.fn((table: unknown) => {
    if (table === files) {
      return { where: fileWhere };
    }

    if (table === folders) {
      return { where: folderWhere };
    }

    throw new Error("Unexpected table");
  });

  return {
    db: {
      select: vi.fn(() => ({ from: selectFrom })),
    },
    spies: {
      fileLimit,
      fileWhere,
      folderThen,
      folderWhere,
      selectFrom,
    },
  };
}

function createSettingsHarness(options?: {
  emailRows?: Array<{ email: string }>;
  initialLinkRows?: Array<{ download_count: number; id: string }>;
  updatedLinkRows?: Array<{
    created_by: string;
    download_count: number;
    file_id: string | null;
    folder_id: string | null;
    id: string;
    is_public: boolean;
    max_downloads: number | null;
    token: string;
  }>;
}) {
  const linkQueue = [
    ...(options?.initialLinkRows ?? []),
    ...(options?.updatedLinkRows ?? []),
  ];
  const emailQueue = [
    ...(options?.emailRows ?? []),
  ];

  const deleteWhere = vi.fn(async () => ({}));
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));
  const insertValues = vi.fn(async () => ({}));
  const insertFn = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn(async () => ({ affectedRows: 1 }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const updateFn = vi.fn(() => ({ set: updateSet }));
  const selectLimit = vi.fn(async () => {
    const next = linkQueue.shift();
    return next ? [next] : [];
  });
  const selectWhere = vi.fn((predicate?: unknown) => {
    const marker = String(predicate ?? "");

    if (marker.includes("share_link_emails")) {
      return {
        then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(emailQueue).then(onFulfilled, onRejected),
      };
    }

    return { limit: selectLimit };
  });
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const selectFn = vi.fn(() => ({ from: selectFrom }));

  const db = {
    delete: deleteFn,
    insert: insertFn,
    select: selectFn,
    transaction: vi.fn(),
    update: updateFn,
  };
  db.transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));

  return {
    db,
    spies: {
      deleteFn,
      deleteWhere,
      insertFn,
      insertValues,
      selectFn,
      selectLimit,
      selectWhere,
      transaction: db.transaction,
      updateFn,
      updateSet,
      updateWhere,
    },
  };
}

describe("share service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("treats revoked links as not found", () => {
    expect(() =>
      assertShareLinkAccessible({
        expires_at: null,
        revoked_at: new Date(),
      }),
    ).toThrowError(new ShareServiceError("NOT_FOUND", "Share link not found", 404));
  });

  it("treats expired links as expired", () => {
    expect(() =>
      assertShareLinkAccessible({
        expires_at: new Date("2020-01-01T00:00:00.000Z"),
        revoked_at: null,
      }),
    ).toThrowError(new ShareServiceError("EXPIRED", "Share link is expired", 410));
  });

  it("allows folder-share file access only when the file lives in the shared subtree", async () => {
    const harness = createSelectHarness({
      fileRows: [{ folderId: "child-folder", id: "file-1" }],
      folderRows: [
        { id: "root-folder", parentId: null },
        { id: "child-folder", parentId: "root-folder" },
        { id: "sibling-folder", parentId: null },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      requireFolderShareTargetFile({
        fileId: "file-1",
        ownerId: "user-1",
        rootFolderId: "root-folder",
      }),
    ).resolves.toBe("file-1");
  });

  it("rejects folder-share file access outside the shared subtree", async () => {
    const harness = createSelectHarness({
      fileRows: [{ folderId: "sibling-folder", id: "file-2" }],
      folderRows: [
        { id: "root-folder", parentId: null },
        { id: "child-folder", parentId: "root-folder" },
        { id: "sibling-folder", parentId: null },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      requireFolderShareTargetFile({
        fileId: "file-2",
        ownerId: "user-1",
        rootFolderId: "root-folder",
      }),
    ).rejects.toThrowError(new ShareServiceError("NOT_FOUND", "Share link not found", 404));
  });

  it("loads direct file metadata for shared file pages", async () => {
    const fileLimit = vi.fn().mockResolvedValue([
      { id: "file-1", mimeType: "image/png", name: "preview.png" },
    ]);
    const fileWhere = vi.fn(() => ({ limit: fileLimit }));
    const selectFrom = vi.fn((table: unknown) => {
      if (table === files) {
        return { where: fileWhere };
      }

      throw new Error("Unexpected table");
    });
    const db = {
      select: vi.fn(() => ({ from: selectFrom })),
    };
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(db as never);

    await expect(
      requireSharedFileSummary({
        fileId: "file-1",
        ownerId: "user-1",
      }),
    ).resolves.toEqual({
      id: "file-1",
      mimeType: "image/png",
      name: "preview.png",
    });
  });

  it("prevents lowering max downloads below the current usage", async () => {
    const harness = createSettingsHarness({
      initialLinkRows: [{ download_count: 3, id: "link-1" }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      updateShareLinkSettings({
        allowedEmails: ["reader@example.com"],
        id: "link-1",
        maxDownloads: 2,
        ownerId: "user-1",
      }),
    ).rejects.toThrowError(
      new ShareServiceError(
        "INVALID_DOWNLOAD_LIMIT",
        "Max downloads cannot be lower than the current download count",
        400,
      ),
    );
    expect(harness.spies.transaction).not.toHaveBeenCalled();
  });
});
