import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchFilesByFilename: vi.fn(),
  searchSemanticFiles: vi.fn(),
}));

vi.mock("@/lib/search/filename-search", () => ({
  searchFilesByFilename: mocks.searchFilesByFilename,
}));

vi.mock("@/lib/search/semantic/semantic-search", () => ({
  searchSemanticFiles: mocks.searchSemanticFiles,
}));

import { searchHybridFiles } from "@/lib/search/semantic/hybrid-search";

describe("searchHybridFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("boosts overlapping semantic and filename results with reciprocal rank fusion", async () => {
    mocks.searchSemanticFiles.mockResolvedValueOnce([
      {
        canPreview: true,
        fileId: "file-semantic",
        folderId: null,
        folderPath: [],
        isInRoot: true,
        matchType: "pdf_page",
        mimeType: "application/pdf",
        name: "cat.pdf",
        pageFrom: 1,
        pageTo: 1,
        retrievalSources: ["semantic"],
        score: 0.7,
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
      {
        canPreview: true,
        fileId: "file-other",
        folderId: null,
        folderPath: [],
        isInRoot: true,
        matchType: "pdf_page",
        mimeType: "application/pdf",
        name: "notes.pdf",
        pageFrom: 2,
        pageTo: 2,
        retrievalSources: ["semantic"],
        score: 0.68,
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
    ]);
    mocks.searchFilesByFilename.mockResolvedValueOnce([
      {
        folderId: null,
        folderPath: [],
        id: "file-other",
        isInRoot: true,
        mimeType: "application/pdf",
        name: "notes.pdf",
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
    ]);

    const results = await searchHybridFiles({
      limit: 10,
      maxScoreGap: 0.05,
      minSimilarity: 0.35,
      query: "notes",
      queryTopK: 50,
      queryVector: [0.1, 0.2],
      userId: "user-1",
    });

    expect(results[0]).toMatchObject({
      fileId: "file-other",
      retrievalSources: ["filename", "semantic"],
    });
  });

  it("includes filename-only results when semantic retrieval misses them", async () => {
    mocks.searchSemanticFiles.mockResolvedValueOnce([]);
    mocks.searchFilesByFilename.mockResolvedValueOnce([
      {
        folderId: null,
        folderPath: [],
        id: "file-erd",
        isInRoot: true,
        mimeType: "application/pdf",
        name: "ERD-spec.pdf",
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
    ]);

    const results = await searchHybridFiles({
      limit: 10,
      maxScoreGap: 0.05,
      minSimilarity: 0.35,
      query: "erd",
      queryTopK: 50,
      queryVector: [0.1, 0.2],
      userId: "user-1",
    });

    expect(results).toEqual([
      {
        canPreview: true,
        fileId: "file-erd",
        folderId: null,
        folderPath: [],
        isInRoot: true,
        matchType: "filename",
        mimeType: "application/pdf",
        name: "ERD-spec.pdf",
        pageFrom: null,
        pageTo: null,
        retrievalSources: ["filename"],
        score: 0,
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
    ]);
  });
});
