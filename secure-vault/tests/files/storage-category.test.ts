import { describe, expect, it } from "vitest";

import { classifyStorageCategory } from "@/lib/files/storage-category";

describe("classifyStorageCategory", () => {
  it("classifies common document mime types", () => {
    expect(classifyStorageCategory("application/pdf")).toBe("documents");
    expect(
      classifyStorageCategory(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("documents");
    expect(classifyStorageCategory("text/plain")).toBe("documents");
  });

  it("classifies media families by mime prefix", () => {
    expect(classifyStorageCategory("image/png")).toBe("images");
    expect(classifyStorageCategory("video/mp4")).toBe("videos");
    expect(classifyStorageCategory("audio/mpeg")).toBe("audio");
  });

  it("classifies archive and compressed mime types", () => {
    expect(classifyStorageCategory("application/zip")).toBe("archives");
    expect(classifyStorageCategory("application/x-7z-compressed")).toBe("archives");
  });

  it("falls back to other for empty or unknown mime types", () => {
    expect(classifyStorageCategory("")).toBe("other");
    expect(classifyStorageCategory("application/x-custom-binary")).toBe("other");
    expect(classifyStorageCategory(undefined)).toBe("other");
    expect(classifyStorageCategory(null)).toBe("other");
  });
});
