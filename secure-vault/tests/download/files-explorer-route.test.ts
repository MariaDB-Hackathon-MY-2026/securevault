import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listFoldersForUser: vi.fn(),
  listReadyFilesForUser: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/api/files/service", () => ({
  listFoldersForUser: mocks.listFoldersForUser,
  listReadyFilesForUser: mocks.listReadyFilesForUser,
}));

import { GET } from "@/app/api/files/explorer/route";

describe("files explorer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid credentials",
    });
  });

  it("returns the current user's files and folders", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
    });
    mocks.listReadyFilesForUser.mockResolvedValueOnce([
      {
        createdAt: "2026-03-31T00:00:00.000Z",
        folderId: null,
        id: "file-1",
        mimeType: "application/pdf",
        name: "report.pdf",
        size: 1234,
        updatedAt: "2026-03-31T00:00:00.000Z",
      },
    ]);
    mocks.listFoldersForUser.mockResolvedValueOnce([
      {
        createdAt: "2026-03-31T00:00:00.000Z",
        id: "folder-1",
        name: "Projects",
        parentId: null,
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      files: [
        {
          createdAt: "2026-03-31T00:00:00.000Z",
          folderId: null,
          id: "file-1",
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 1234,
          updatedAt: "2026-03-31T00:00:00.000Z",
        },
      ],
      folders: [
        {
          createdAt: "2026-03-31T00:00:00.000Z",
          id: "folder-1",
          name: "Projects",
          parentId: null,
        },
      ],
    });
    expect(mocks.listReadyFilesForUser).toHaveBeenCalledWith("user-1");
    expect(mocks.listFoldersForUser).toHaveBeenCalledWith("user-1");
  });
});
