import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_SECURE } from "@/lib/auth/cookies";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  getMasterKey: vi.fn(),
  getShareLinkByToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/crypto/aes", () => ({
  decrypt: mocks.decrypt,
  encrypt: mocks.encrypt,
}));

vi.mock("@/lib/crypto/keys", () => ({
  getMasterKey: mocks.getMasterKey,
}));

vi.mock("@/lib/sharing/share-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sharing/share-service")>(
    "@/lib/sharing/share-service",
  );

  return {
    ...actual,
    getShareLinkByToken: mocks.getShareLinkByToken,
  };
});

import {
  clearShareAccessSession,
  createShareAccessSession,
  readShareAccessSession,
  requireValidShareAccessSession,
} from "@/lib/sharing/share-access-session";

describe("share access session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMasterKey.mockReturnValue(Buffer.alloc(32, 7));
  });

  it("writes a root-scoped httpOnly cookie when creating a session", async () => {
    const set = vi.fn();
    mocks.encrypt.mockReturnValue(Buffer.from("encrypted"));
    mocks.cookies.mockResolvedValue({ set });

    await createShareAccessSession({
      email: "reader@example.com",
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      linkId: "link-1",
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOnly: true,
        name: `${AUTH_COOKIE_SECURE ? "__Secure-" : ""}share-link-1`,
        path: "/",
        sameSite: "lax",
        secure: AUTH_COOKIE_SECURE,
      }),
    );
  });

  it("returns null when the stored session is missing", async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });

    await expect(readShareAccessSession("link-1")).resolves.toBeNull();
  });

  it("returns null when the session link id does not match", async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: Buffer.from("encrypted").toString("hex") })),
    });
    mocks.decrypt.mockReturnValue(
      Buffer.from(
        JSON.stringify({
          email: "reader@example.com",
          expiresAt: "2099-01-01T00:00:00.000Z",
          linkId: "other-link",
          verifiedAt: "2026-04-01T00:00:00.000Z",
        }),
      ),
    );

    await expect(readShareAccessSession("link-1")).resolves.toBeNull();
  });

  it("requires a matching active link when validating a session", async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: Buffer.from("encrypted").toString("hex") })),
    });
    mocks.decrypt.mockReturnValue(
      Buffer.from(
        JSON.stringify({
          email: "reader@example.com",
          expiresAt: "2099-01-01T00:00:00.000Z",
          linkId: "link-1",
          verifiedAt: "2026-04-01T00:00:00.000Z",
        }),
      ),
    );
    mocks.getShareLinkByToken.mockResolvedValue({
      expires_at: null,
      id: "link-1",
      revoked_at: null,
    });

    await expect(
      requireValidShareAccessSession({ linkId: "link-1", token: "share-token" }),
    ).resolves.toEqual(
      expect.objectContaining({
        email: "reader@example.com",
        linkId: "link-1",
      }),
    );
  });

  it("clears the cookie at the root path", async () => {
    const set = vi.fn();
    mocks.cookies.mockResolvedValue({ set });

    await clearShareAccessSession("link-1");

    expect(set).toHaveBeenCalledWith(
      `${AUTH_COOKIE_SECURE ? "__Secure-" : ""}share-link-1`,
      "",
      expect.objectContaining({
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure: AUTH_COOKIE_SECURE,
      }),
    );
  });
});
