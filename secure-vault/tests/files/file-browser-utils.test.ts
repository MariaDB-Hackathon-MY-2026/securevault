import { describe, expect, it } from "vitest";

import {
  formatFileSize,
  getFolderPath,
  matchesExplorerFilter,
} from "@/components/files/file-browser-utils";
import type { FolderListItem } from "@/lib/files/types";

function createFolder(overrides: Partial<FolderListItem> = {}): FolderListItem {
  return {
    createdAt: "2026-03-20T00:00:00.000Z",
    id: "folder-1",
    name: "Folder",
    parentId: null,
    ...overrides,
  };
}

describe("file-browser-utils", () => {
  describe("getFolderPath", () => {
    it("returns an empty array for the root view", () => {
      expect(getFolderPath(null, new Map())).toEqual([]);
    });

    it("breaks circular references instead of looping forever", () => {
      const folderMap = new Map<string, FolderListItem>([
        ["a", createFolder({ id: "a", name: "A", parentId: "b" })],
        ["b", createFolder({ id: "b", name: "B", parentId: "a" })],
      ]);

      expect(getFolderPath("a", folderMap).map((folder) => folder.id)).toEqual(["b", "a"]);
    });

    it("builds a full breadcrumb path for nested folders", () => {
      const folderMap = new Map<string, FolderListItem>([
        ["root", createFolder({ id: "root", name: "Root" })],
        ["child", createFolder({ id: "child", name: "Child", parentId: "root" })],
        ["leaf", createFolder({ id: "leaf", name: "Leaf", parentId: "child" })],
      ]);

      expect(getFolderPath("leaf", folderMap).map((folder) => folder.name)).toEqual([
        "Root",
        "Child",
        "Leaf",
      ]);
    });
  });

  describe("formatFileSize", () => {
    it("returns 0 B for zero bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
    });

    it("formats one kilobyte with a decimal place", () => {
      expect(formatFileSize(1024)).toBe("1.0 KB");
    });

    it("handles negative sizes without throwing", () => {
      expect(formatFileSize(-1)).toBe("0 B");
    });
  });

  describe("matchesExplorerFilter", () => {
    it("matches everything when the filter is blank", () => {
      expect(matchesExplorerFilter("Quarterly Report", "   ")).toBe(true);
    });

    it("matches case-insensitively", () => {
      expect(matchesExplorerFilter("Quarterly Report", "quarter")).toBe(true);
      expect(matchesExplorerFilter("Quarterly Report", "REPORT")).toBe(true);
    });
  });
});
