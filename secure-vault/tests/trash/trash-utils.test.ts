import { describe, expect, it } from "vitest";

import {
  calculateReclaimedBytes,
  getTrashPurgeAt,
  isRootDeletedFile,
  isRootDeletedFolder,
  summarizeDeletedFolderSubtree,
} from "@/lib/trash/trash-utils";
import { TRASH_RETENTION_DAYS } from "@/lib/constants/trash";

describe("trash utils", () => {
  it("ignores deleted files whose parent folder is already deleted", () => {
    const folderMap = new Map([
      ["folder-1", { deletedAt: new Date("2026-04-01T00:00:00.000Z") }],
    ]);

    expect(isRootDeletedFile({
      deletedAt: new Date("2026-04-02T00:00:00.000Z"),
      folderId: "folder-1",
    }, folderMap)).toBe(false);
  });

  it("ignores deleted child folders beneath a deleted parent folder", () => {
    const folderMap = new Map([
      ["parent", { deletedAt: new Date("2026-04-01T00:00:00.000Z") }],
    ]);

    expect(isRootDeletedFolder({
      deletedAt: new Date("2026-04-02T00:00:00.000Z"),
      parentId: "parent",
    }, folderMap)).toBe(false);
  });

  it("uses the shared retention window for purge timing", () => {
    const deletedAt = new Date("2026-04-01T00:00:00.000Z");
    const purgeAt = getTrashPurgeAt(deletedAt);

    expect(purgeAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect((purgeAt.getTime() - deletedAt.getTime()) / (24 * 60 * 60 * 1000)).toBe(
      TRASH_RETENTION_DAYS,
    );
  });

  it("counts only ready files when reclaiming quota", () => {
    expect(
      calculateReclaimedBytes([
        { size: 512, status: "ready" },
        { size: 1024, status: "uploading" },
        { size: 2048, status: "failed" },
      ]),
    ).toBe(512);
  });

  it("summarizes a deleted folder subtree once instead of listing descendants separately", () => {
    const summary = summarizeDeletedFolderSubtree(
      "root",
      [
        { deletedAt: new Date("2026-04-01T00:00:00.000Z"), id: "root", parentId: null },
        { deletedAt: new Date("2026-04-01T00:00:00.000Z"), id: "child", parentId: "root" },
      ],
      [
        { deletedAt: new Date("2026-04-01T00:00:00.000Z"), folderId: "root", size: 256 },
        { deletedAt: new Date("2026-04-01T00:00:00.000Z"), folderId: "child", size: 512 },
      ],
    );

    expect(summary).toEqual({
      descendantFileCount: 2,
      descendantFolderCount: 1,
      totalBytes: 768,
    });
  });
});
