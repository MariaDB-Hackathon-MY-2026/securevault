import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearShareAccessSession: vi.fn(),
  requireShareLinkByToken: vi.fn(),
}));

vi.mock("@/lib/sharing/share-access-session", () => ({
  clearShareAccessSession: mocks.clearShareAccessSession,
}));

vi.mock("@/lib/sharing/share-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sharing/share-service")>(
    "@/lib/sharing/share-service",
  );

  return {
    ...actual,
    requireShareLinkByToken: mocks.requireShareLinkByToken,
  };
});

import { POST } from "@/app/api/share/[token]/logout/route";
import { ShareServiceError } from "@/lib/sharing/share-service";

describe("share logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the session for the current share link", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue({
      id: "link-1",
    });

    const response = await POST(new Request("https://example.com") as never, {
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.clearShareAccessSession).toHaveBeenCalledWith("link-1");
  });

  it("maps missing links to the service status code", async () => {
    mocks.requireShareLinkByToken.mockRejectedValueOnce(
      new ShareServiceError("NOT_FOUND", "Share link not found", 404),
    );

    const response = await POST(new Request("https://example.com") as never, {
      params: Promise.resolve({ token: "missing-token" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Share link not found" });
    expect(mocks.clearShareAccessSession).not.toHaveBeenCalled();
  });
});
