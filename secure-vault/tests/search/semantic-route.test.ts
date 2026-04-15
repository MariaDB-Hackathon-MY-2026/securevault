import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  embedSemanticQuery: vi.fn(),
  getCurrentUser: vi.fn(),
  getSemanticConfig: vi.fn(),
  searchSemanticFiles: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/ai/config", () => ({
  getSemanticConfig: mocks.getSemanticConfig,
}));

vi.mock("@/lib/search/semantic/query-embedder", () => ({
  embedSemanticQuery: mocks.embedSemanticQuery,
}));

vi.mock("@/lib/search/semantic/semantic-search", () => ({
  searchSemanticFiles: mocks.searchSemanticFiles,
}));

import { POST } from "@/app/api/search/semantic/route";

describe("semantic search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSemanticConfig.mockReturnValue({
      enabled: true,
      queryTopK: 50,
    });
  });

  it("returns 401 for unauthenticated requests", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/search/semantic", {
      body: JSON.stringify({ query: "report" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid request bodies", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });

    const response = await POST(new Request("http://localhost/api/search/semantic", {
      body: JSON.stringify({ query: "a" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(400);
  });

  it("returns 503 when semantic search is disabled", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.getSemanticConfig.mockReturnValueOnce({ enabled: false, queryTopK: 50 });

    const response = await POST(new Request("http://localhost/api/search/semantic", {
      body: JSON.stringify({ query: "report" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: "SEMANTIC_INDEXING_DISABLED",
    });
  });

  it("embeds the query and returns folded results", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.embedSemanticQuery.mockResolvedValueOnce([0.1, 0.2]);
    mocks.searchSemanticFiles.mockResolvedValueOnce([
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
        score: 0.91,
        size: 1024,
        updatedAt: "2026-04-15T00:00:00.000Z",
      },
    ]);

    const response = await POST(new Request("http://localhost/api/search/semantic", {
      body: JSON.stringify({ limit: 5, query: "report" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      limit: 5,
      query: "report",
      results: [
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
          score: 0.91,
          size: 1024,
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ],
    });
    expect(mocks.embedSemanticQuery).toHaveBeenCalledWith("report");
    expect(mocks.searchSemanticFiles).toHaveBeenCalledWith({
      limit: 5,
      queryTopK: 50,
      queryVector: [0.1, 0.2],
      userId: "user-1",
    });
  });
});
