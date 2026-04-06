import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT_ERROR = new Error("NEXT_REDIRECT");

const mocks = vi.hoisted(() => ({
  getUserByEmail: vi.fn(),
  verifyPassword: vi.fn(),
  getRequestMetaData: vi.fn(),
  enforceRateLimit: vi.fn(),
  createSession: vi.fn(),
  setAuthCookies: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/db/crud/user/get-user-by-email", () => ({
  getUserByEmail: mocks.getUserByEmail,
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/auth/request-metadata", () => ({
  getRequestMetaData: mocks.getRequestMetaData,
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");

  return {
    ...actual,
    enforceRateLimit: mocks.enforceRateLimit,
  };
});

vi.mock("@/lib/auth/session", () => ({
  createSession: mocks.createSession,
}));

vi.mock("@/lib/auth/cookies", () => ({
  setAuthCookies: mocks.setAuthCookies,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { loginAction } from "@/app/(auth)/login/actions";

function buildLoginFormData(overrides?: {
  email?: FormDataEntryValue | null;
  password?: FormDataEntryValue | null;
}) {
  const formData = new FormData();

  if (overrides?.email !== null) {
    formData.append("email", overrides?.email ?? "Alice@example.com");
  }

  if (overrides?.password !== null) {
    formData.append("password", overrides?.password ?? "CorrectHorseBatteryStaple!2026");
  }

  return formData;
}

describe("loginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.getUserByEmail.mockResolvedValue([
      { userId: "user-123", passwordHash: "stored-hash" },
    ]);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.getRequestMetaData.mockResolvedValue({
      device_name: "Chrome on Windows",
      ip_address: "203.0.113.10",
    });
    mocks.enforceRateLimit.mockResolvedValue({
      success: true,
    });
    mocks.createSession.mockResolvedValue({
      sessionToken: "session-token",
      refreshToken: "refresh-token",
    });
    mocks.setAuthCookies.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation(() => {
      throw REDIRECT_ERROR;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes email, verifies the password, creates a session, sets cookies, and redirects", async () => {
    const formData = buildLoginFormData({
      email: "  Alice@Example.com  ",
      password: "CorrectHorseBatteryStaple!2026",
    });

    await expect(loginAction(undefined, formData)).rejects.toBe(REDIRECT_ERROR);

    expect(mocks.getUserByEmail).toHaveBeenCalledWith("alice@example.com");
    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "CorrectHorseBatteryStaple!2026",
      "stored-hash",
    );
    expect(mocks.getRequestMetaData).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).toHaveBeenCalledWith("user-123", {
      device_name: "Chrome on Windows",
      ip_address: "203.0.113.10",
    });
    expect(mocks.setAuthCookies).toHaveBeenCalledWith("session-token", "refresh-token");
    expect(mocks.redirect).toHaveBeenCalledWith("/activity");
  });

  it("returns a missing-fields error when email is absent", async () => {
    const formData = buildLoginFormData({ email: null });

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "Missing required fields",
    });

    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a missing-fields error when password is absent", async () => {
    const formData = buildLoginFormData({ password: null });

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "Missing required fields",
    });

    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a missing-fields error when trimmed email becomes empty", async () => {
    const formData = buildLoginFormData({ email: "   " });

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "Missing required fields",
    });

    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
  });

  it("rejects non-string FormData entries", async () => {
    const formData = buildLoginFormData({
      email: new File(["alice"], "avatar.png", { type: "image/png" }),
    });

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "Missing required fields",
    });

    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
  });

  it("returns the generic invalid-credentials error when the user is not found", async () => {
    const formData = buildLoginFormData();

    mocks.getUserByEmail.mockResolvedValueOnce([]);

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "Invalid login email or password",
    });

    expect(mocks.getRequestMetaData).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns the generic invalid-credentials error when the password is wrong", async () => {
    const formData = buildLoginFormData();

    mocks.verifyPassword.mockResolvedValueOnce(false);

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "Invalid login email or password",
    });

    expect(mocks.getRequestMetaData).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns the generic invalid-credentials error when hash verification throws", async () => {
    const formData = buildLoginFormData();

    mocks.verifyPassword.mockRejectedValueOnce(new Error("malformed hash"));

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "Invalid login email or password",
    });

    expect(mocks.getRequestMetaData).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a rate-limit error before database lookup when the limiter blocks the request", async () => {
    const formData = buildLoginFormData();

    mocks.enforceRateLimit.mockResolvedValueOnce({
      success: false,
    });

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "Too many attempts. Please try again later.",
    });

    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("returns a generic error when session creation fails", async () => {
    const formData = buildLoginFormData();

    mocks.createSession.mockRejectedValueOnce(new Error("session creation failed"));

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "We couldn't log you in right now. Please try again.",
    });

    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic error when writing cookies fails", async () => {
    const formData = buildLoginFormData();

    mocks.setAuthCookies.mockRejectedValueOnce(new Error("cookie store unavailable"));

    await expect(loginAction(undefined, formData)).resolves.toEqual({
      error: "We couldn't log you in right now. Please try again.",
    });

    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

