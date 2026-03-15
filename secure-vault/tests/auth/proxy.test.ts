import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const validateSession = vi.fn();
  const refreshSession = vi.fn();
  const nextCookieSet = vi.fn();
  const redirectCookieSet = vi.fn();
  const next = vi.fn(() => ({ type: "next", cookies: { set: nextCookieSet } }));
  const redirect = vi.fn((url: URL) => ({ type: "redirect", url: url.toString(), cookies: { set: redirectCookieSet } }));

  return {
    validateSession,
    refreshSession,
    nextCookieSet,
    redirectCookieSet,
    next,
    redirect,
  };
});

vi.mock("@/lib/auth/session", () => ({
  validateSession: mocks.validateSession,
  refreshSession: mocks.refreshSession,
}));

vi.mock("@/lib/auth/cookies", () => ({
  SESSION_TOKEN_MAX_AGE_SECONDS: 15 * 60,
  REFRESH_TOKEN_MAX_AGE_SECONDS: 30 * 24 * 60 * 60,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: mocks.next,
    redirect: mocks.redirect,
  },
}));

import { config, proxy } from "@/proxy";

function buildRequest({
  sessionToken,
  refreshToken,
  url = "https://example.com/dashboard/files",
}: {
  sessionToken?: string;
  refreshToken?: string;
  url?: string;
}) {
  return {
    url,
    cookies: {
      get: vi.fn((name: string) => {
        if (name === "__Secure-session" && sessionToken) {
          return { value: sessionToken };
        }

        if (name === "__Secure-refresh" && refreshToken) {
          return { value: refreshToken };
        }

        return undefined;
      }),
    },
  };
}

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the request through when the session token is valid", async () => {
    mocks.validateSession.mockResolvedValue({ id: "user-1" });

    const response = await proxy(buildRequest({ sessionToken: "session-token" }) as never);

    expect(mocks.validateSession).toHaveBeenCalledWith("session-token");
    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(mocks.next).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({ type: "next" });
  });

  it("redirects to login when no usable auth cookies are present", async () => {
    const response = await proxy(buildRequest({}) as never);

    expect(mocks.validateSession).not.toHaveBeenCalled();
    expect(mocks.refreshSession).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      type: "redirect",
      url: "https://example.com/login",
    });
  });

  it("rotates cookies on the proxy response when refresh succeeds", async () => {
    mocks.validateSession.mockResolvedValue(null);
    mocks.refreshSession.mockResolvedValue({
      sessionToken: "new-session-token",
      refreshToken: "new-refresh-token",
    });

    const response = await proxy(
      buildRequest({ sessionToken: "expired-session-token", refreshToken: "refresh-token" }) as never,
    );

    expect(mocks.validateSession).toHaveBeenCalledWith("expired-session-token");
    expect(mocks.refreshSession).toHaveBeenCalledWith("refresh-token");
    expect(mocks.nextCookieSet).toHaveBeenNthCalledWith(1, "__Secure-session", "new-session-token", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 15 * 60,
    });
    expect(mocks.nextCookieSet).toHaveBeenNthCalledWith(2, "__Secure-refresh", "new-refresh-token", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(response).toMatchObject({ type: "next" });
  });

  it("redirects to login when the session is invalid and refresh fails", async () => {
    mocks.validateSession.mockResolvedValue(null);
    mocks.refreshSession.mockResolvedValue(null);

    const response = await proxy(
      buildRequest({ sessionToken: "expired-session-token", refreshToken: "expired-refresh-token" }) as never,
    );

    expect(mocks.refreshSession).toHaveBeenCalledWith("expired-refresh-token");
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      type: "redirect",
      url: "https://example.com/login",
    });
  });

  it("protects only the intended route groups", () => {
    expect(config.matcher).toEqual([
      "/dashboard/:path*",
      "/api/upload/:path*",
      "/api/files/:path*",
      "/api/share/:path*",
      "/api/chat/:path*",
    ]);
  });
});
