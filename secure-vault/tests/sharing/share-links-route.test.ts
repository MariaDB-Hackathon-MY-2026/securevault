import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listShareLinksForOwner: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/sharing/share-service", () => ({
  listShareLinksForOwner: mocks.listShareLinksForOwner,
}));

import { GET } from "@/app/api/share/links/route";

describe("share links route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated users", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com/api/share/links?fileId=file-1") as never);

    expect(response.status).toBe(401);
  });

  it("returns 400 when neither fileId nor folderId is provided", async () => {
    mocks.getCurrentUser.mockResolvedValue({ email_verified: true, id: "user-1" });

    const response = await GET(new Request("https://example.com/api/share/links") as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Must specify either a fileId or folderId",
    });
  });

  it("returns owner-scoped links for a valid request", async () => {
    mocks.getCurrentUser.mockResolvedValue({ email_verified: true, id: "user-1" });
    mocks.listShareLinksForOwner.mockResolvedValue([{ id: "link-1" }]);

    const response = await GET(new Request("https://example.com/api/share/links?fileId=file-1") as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([{ id: "link-1" }]);
    expect(mocks.listShareLinksForOwner).toHaveBeenCalledWith({
      fileId: "file-1",
      folderId: undefined,
      ownerId: "user-1",
    });
  });
});
