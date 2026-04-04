import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  requireSharedFileSummary: vi.fn(),
  requireShareLinkByToken: vi.fn(),
  requireValidShareAccessSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/sharing/share-access-session", () => ({
  requireValidShareAccessSession: mocks.requireValidShareAccessSession,
}));

vi.mock("@/lib/sharing/share-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sharing/share-service")>(
    "@/lib/sharing/share-service",
  );

  return {
    ...actual,
    requireSharedFileSummary: mocks.requireSharedFileSummary,
    requireShareLinkByToken: mocks.requireShareLinkByToken,
  };
});

import SharedLinkPage from "@/app/s/[token]/page";
import { ShareServiceError } from "@/lib/sharing/share-service";

type ComponentLike = (...args: never[]) => unknown;

describe("shared link page", () => {
  it("renders the auth view for restricted links without a session", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue({
      allowedEmails: ["reader@example.com"],
      expires_at: null,
      id: "link-1",
      is_public: false,
      revoked_at: null,
      targetId: "file-1",
      targetType: "file",
    });
    mocks.requireValidShareAccessSession.mockResolvedValue(null);

    const element = await SharedLinkPage({
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(element).toMatchObject({
      props: { token: "share-token" },
      type: expect.anything(),
    });
    expect(element.type).toEqual(expect.any(Function as unknown as ComponentLike));
  });

  it("passes file metadata to the shared file view for direct file links", async () => {
    mocks.requireShareLinkByToken.mockResolvedValue({
      allowedEmails: [],
      created_by: "owner-1",
      expires_at: null,
      id: "link-1",
      is_public: true,
      revoked_at: null,
      targetId: "file-1",
      targetType: "file",
    });
    mocks.requireSharedFileSummary.mockResolvedValue({
      id: "file-1",
      mimeType: "image/png",
      name: "preview.png",
    });

    const element = await SharedLinkPage({
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(element).toMatchObject({
      props: expect.objectContaining({
        fileId: "file-1",
        fileName: "preview.png",
        mimeType: "image/png",
        token: "share-token",
      }),
      type: expect.anything(),
    });
    expect(element.type).toEqual(expect.any(Function as unknown as ComponentLike));
  });

  it("renders the expired state for expired links", async () => {
    mocks.requireShareLinkByToken.mockRejectedValueOnce(
      new ShareServiceError("EXPIRED", "Share link is expired", 410),
    );

    const element = await SharedLinkPage({
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(element).toMatchObject({
      props: {},
      type: expect.anything(),
    });
    expect(element.type).toEqual(expect.any(Function as unknown as ComponentLike));
    expect((element.type as { name?: string }).name).toBe("ExpiredState");
  });

  it("uses notFound for revoked or missing links", async () => {
    mocks.requireShareLinkByToken.mockRejectedValueOnce(
      new ShareServiceError("NOT_FOUND", "Share link not found", 404),
    );

    await expect(
      SharedLinkPage({ params: Promise.resolve({ token: "share-token" }) }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
