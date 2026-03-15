import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const set = vi.fn();
  const cookies = vi.fn(async () => ({ set }));

  return { cookies, set };
});

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

import { clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies";

describe("auth cookies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the session and refresh cookies with the expected flags and second-based expiries", async () => {
    await setAuthCookies("session-token", "refresh-token");

    expect(mocks.cookies).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenNthCalledWith(1, "__Secure-session", "session-token", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 15 * 60,
    });
    expect(mocks.set).toHaveBeenNthCalledWith(2, "__Secure-refresh", "refresh-token", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  });

  it("clears both auth cookies by overwriting them with empty values and maxAge zero", async () => {
    await clearAuthCookies();

    expect(mocks.cookies).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenNthCalledWith(1, "__Secure-session", "", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 0,
    });
    expect(mocks.set).toHaveBeenNthCalledWith(2, "__Secure-refresh", "", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 0,
    });
  });
});
