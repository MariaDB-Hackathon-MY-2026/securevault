import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listReadyFilesForUser: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/files/download-service", () => ({
  listReadyFilesForUser: mocks.listReadyFilesForUser,
}));

import { GET } from "@/app/api/files/route";

describe("files route", () => {
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

  it("returns the current user's ready files", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      id: "user-1",
    });
    mocks.listReadyFilesForUser.mockResolvedValueOnce([
      {
        createdAt: "2026-03-31T00:00:00.000Z",
        id: "file-1",
        mimeType: "application/pdf",
        name: "report.pdf",
        size: 1234,
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      files: [
        {
          createdAt: "2026-03-31T00:00:00.000Z",
          id: "file-1",
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 1234,
        },
      ],
    });
    expect(mocks.listReadyFilesForUser).toHaveBeenCalledWith("user-1");
  });
});
