import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  searchFilesByFilename: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/search/filename-search", () => ({
  searchFilesByFilename: mocks.searchFilesByFilename,
}));

import { GET } from "@/app/api/search/files/route";

describe("search files route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/search/files?q=report"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid credentials",
    });
  });

  it("returns 400 for blank queries", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });

    const response = await GET(new Request("http://localhost/api/search/files?q=   "));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Query is required",
    });
  });

  it("returns 400 for one-character queries", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });

    const response = await GET(new Request("http://localhost/api/search/files?q=r"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Query must be at least 2 characters",
    });
  });

  it("returns results for valid queries and passes user scope plus capped limit input to the service", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.searchFilesByFilename.mockResolvedValueOnce([
      {
        folderId: null,
        folderPath: [],
        id: "file-1",
        isInRoot: true,
        mimeType: "application/pdf",
        name: "report.pdf",
        size: 1234,
        updatedAt: "2026-04-07T00:00:00.000Z",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/search/files?q=report&limit=999"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      query: "report",
      results: [
        {
          folderId: null,
          folderPath: [],
          id: "file-1",
          isInRoot: true,
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 1234,
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
      ],
    });
    expect(mocks.searchFilesByFilename).toHaveBeenCalledWith({
      limit: 999,
      query: "report",
      userId: "user-1",
    });
  });

  it("returns 500 when the search service fails", async () => {
    const error = new Error("database offline");
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.searchFilesByFilename.mockRejectedValueOnce(error);

    const response = await GET(new Request("http://localhost/api/search/files?q=report"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Failed to search files",
    });
  });
});
