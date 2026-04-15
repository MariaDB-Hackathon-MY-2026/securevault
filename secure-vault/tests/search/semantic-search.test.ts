import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canPreviewMime: vi.fn(),
  dbExecute: vi.fn(),
  fallbackRows: [] as Array<{
    chunkIndex: number;
    chunkType: "full" | "page" | "window";
    embedding: string;
    fileId: string;
    folderId: string | null;
    mimeType: string;
    modality: "image" | "pdf";
    name: string;
    pageFrom: number | null;
    pageTo: number | null;
    size: number;
    updatedAt: Date;
  }>,
  listFolderRows: vi.fn(),
}));

vi.mock("@/lib/files/preview", () => ({
  canPreviewMime: mocks.canPreviewMime,
}));

vi.mock("@/lib/ai/embeddings/embedding-job-repository", () => ({
  EmbeddingJobRepository: class {
    listFolderRows = mocks.listFolderRows;
  },
}));

vi.mock("@/lib/db", () => ({
  MariadbConnection: {
    getConnection: () => ({
      execute: mocks.dbExecute,
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => Promise.resolve(mocks.fallbackRows),
            }),
          }),
        }),
      }),
    }),
  },
}));

import { searchSemanticFiles } from "@/lib/search/semantic/semantic-search";

describe("searchSemanticFiles fallback scoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canPreviewMime.mockReturnValue(true);
    mocks.listFolderRows.mockResolvedValue([]);
    mocks.dbExecute.mockRejectedValue(new Error("vec_distance_cosine unavailable in tests"));
    mocks.fallbackRows.length = 0;
  });

  it("parses vector text returned by the fallback query and ranks results", async () => {
    mocks.fallbackRows.push({
      chunkIndex: 0,
      chunkType: "page",
      embedding: "[0.6,0.8]",
      fileId: "file-1",
      folderId: null,
      mimeType: "application/pdf",
      modality: "pdf",
      name: "report.pdf",
      pageFrom: 2,
      pageTo: 2,
      size: 1024,
      updatedAt: new Date("2026-04-15T00:00:00.000Z"),
    });

    const results = await searchSemanticFiles({
      limit: 10,
      maxScoreGap: 0.05,
      minSimilarity: 0.35,
      queryTopK: 50,
      queryVector: [0.6, 0.8],
      userId: "user-1",
    });

    expect(results).toEqual([
      {
        canPreview: true,
        fileId: "file-1",
        folderId: null,
        folderPath: [],
        isInRoot: true,
        matchType: "pdf_page",
        mimeType: "application/pdf",
        name: "report.pdf",
        pageFrom: 2,
        pageTo: 2,
        retrievalSources: ["semantic"],
        score: 1,
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
    ]);
  });

  it("normalizes string timestamps returned by the database scoring path", async () => {
    mocks.dbExecute.mockResolvedValueOnce([[
      {
        chunkIndex: 0,
        chunkType: "page",
        embedding: Buffer.from("ignored"),
        fileId: "file-1",
        folderId: null,
        mimeType: "application/pdf",
        modality: "pdf",
        name: "report.pdf",
        pageFrom: 3,
        pageTo: 3,
        score: 0.91,
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
    ]]);

    const results = await searchSemanticFiles({
      limit: 10,
      maxScoreGap: 0.05,
      minSimilarity: 0.35,
      queryTopK: 50,
      queryVector: [0.6, 0.8],
      userId: "user-1",
    });

    expect(results).toEqual([
      {
        canPreview: true,
        fileId: "file-1",
        folderId: null,
        folderPath: [],
        isInRoot: true,
        matchType: "pdf_page",
        mimeType: "application/pdf",
        name: "report.pdf",
        pageFrom: 3,
        pageTo: 3,
        retrievalSources: ["semantic"],
        score: 0.91,
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
    ]);
  });

  it("drops weak semantic matches below the minimum similarity threshold", async () => {
    mocks.fallbackRows.push(
      {
        chunkIndex: 0,
        chunkType: "page",
        embedding: "[1,0]",
        fileId: "file-strong",
        folderId: null,
        mimeType: "application/pdf",
        modality: "pdf",
        name: "strong.pdf",
        pageFrom: 1,
        pageTo: 1,
        size: 1024,
        updatedAt: new Date("2026-04-15T00:00:00.000Z"),
      },
      {
        chunkIndex: 0,
        chunkType: "page",
        embedding: "[0,1]",
        fileId: "file-weak",
        folderId: null,
        mimeType: "application/pdf",
        modality: "pdf",
        name: "weak.pdf",
        pageFrom: 1,
        pageTo: 1,
        size: 1024,
        updatedAt: new Date("2026-04-15T00:00:00.000Z"),
      },
    );

    const results = await searchSemanticFiles({
      limit: 10,
      maxScoreGap: 0.05,
      minSimilarity: 0.5,
      queryTopK: 50,
      queryVector: [1, 0],
      userId: "user-1",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      fileId: "file-strong",
      score: 1,
    });
  });

  it("drops tail results that fall too far below the top score", async () => {
    mocks.fallbackRows.push(
      {
        chunkIndex: 0,
        chunkType: "page",
        embedding: "[0.648,0.761640335]",
        fileId: "file-dog",
        folderId: null,
        mimeType: "application/pdf",
        modality: "pdf",
        name: "dog.pdf",
        pageFrom: 1,
        pageTo: 1,
        size: 1024,
        updatedAt: new Date("2026-04-15T00:00:00.000Z"),
      },
      {
        chunkIndex: 0,
        chunkType: "page",
        embedding: "[0.601,0.799248396]",
        fileId: "file-erd",
        folderId: null,
        mimeType: "application/pdf",
        modality: "pdf",
        name: "erd.pdf",
        pageFrom: 1,
        pageTo: 1,
        size: 1024,
        updatedAt: new Date("2026-04-15T00:00:00.000Z"),
      },
    );

    const results = await searchSemanticFiles({
      limit: 10,
      maxScoreGap: 0.04,
      minSimilarity: 0.35,
      queryTopK: 50,
      queryVector: [1, 0],
      userId: "user-1",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      fileId: "file-dog",
    });
  });
});
