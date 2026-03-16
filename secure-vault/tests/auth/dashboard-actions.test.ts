import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  clearAuthCookies: vi.fn(),
  requireCurrentUser: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  validatePasswordStrength: vi.fn(),
  deleteAllSessions: vi.fn(),
  deleteOtherSessions: vi.fn(),
  deleteSession: vi.fn(),
  deleteSessionByToken: vi.fn(),
  getSessionByToken: vi.fn(),
  listUserSessions: vi.fn(),
  getUserById: vi.fn(),
  updateUserName: vi.fn(),
  updateUserPassword: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth/cookies", () => ({
  clearAuthCookies: mocks.clearAuthCookies,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/auth/password-strength", () => ({
  validatePasswordStrength: mocks.validatePasswordStrength,
}));

vi.mock("@/lib/auth/session", () => ({
  deleteAllSessions: mocks.deleteAllSessions,
  deleteOtherSessions: mocks.deleteOtherSessions,
  deleteSession: mocks.deleteSession,
  deleteSessionByToken: mocks.deleteSessionByToken,
  getSessionByToken: mocks.getSessionByToken,
  listUserSessions: mocks.listUserSessions,
}));

vi.mock("@/lib/db/crud/user", () => ({
  getUserById: mocks.getUserById,
  updateUserName: mocks.updateUserName,
  updateUserPassword: mocks.updateUserPassword,
}));

import {
  changePasswordAction,
  logoutAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  updateProfileAction,
} from "@/app/(dashboard)/actions";

function makeRedirectError(url: string) {
  return Object.assign(new Error("NEXT_REDIRECT"), { url });
}

function createCookieStore(sessionToken: string | null = "session-token") {
  return {
    get: vi.fn((name: string) => {
      if (name === "__Secure-session" && sessionToken) {
        return { value: sessionToken };
      }

      return undefined;
    }),
  };
}

describe("dashboard actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.cookies.mockResolvedValue(createCookieStore());
    mocks.redirect.mockImplementation((url: string) => {
      throw makeRedirectError(url);
    });
    mocks.clearAuthCookies.mockResolvedValue(undefined);
    mocks.requireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      email_verified: true,
      storage_used: 1,
      storage_quota: 2,
      created_at: new Date("2026-03-17T00:00:00.000Z"),
      uek: Buffer.from("uek"),
    });
    mocks.hashPassword.mockResolvedValue("hashed-new-password");
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.validatePasswordStrength.mockReturnValue({ valid: true, feedback: "", strength: 4 });
    mocks.getSessionByToken.mockResolvedValue({ id: "session-1", user_id: "user-1" });
    mocks.listUserSessions.mockResolvedValue([
      {
        id: "session-1",
        device_name: "Chrome",
        ip_address: "127.0.0.1",
        session_expires_at: new Date("2026-03-17T01:00:00.000Z"),
        refresh_expires_at: new Date("2026-04-16T00:00:00.000Z"),
        created_at: new Date("2026-03-17T00:00:00.000Z"),
      },
      {
        id: "session-2",
        device_name: "Safari",
        ip_address: "203.0.113.1",
        session_expires_at: new Date("2026-03-17T01:00:00.000Z"),
        refresh_expires_at: new Date("2026-04-16T00:00:00.000Z"),
        created_at: new Date("2026-03-16T22:00:00.000Z"),
      },
    ]);
    mocks.getUserById.mockResolvedValue({
      id: "user-1",
      password_hash: "stored-hash",
    });
    mocks.updateUserName.mockResolvedValue(undefined);
    mocks.updateUserPassword.mockResolvedValue(undefined);
    mocks.deleteSessionByToken.mockResolvedValue(undefined);
    mocks.deleteSession.mockResolvedValue(undefined);
    mocks.deleteAllSessions.mockResolvedValue(undefined);
    mocks.deleteOtherSessions.mockResolvedValue(undefined);
  });

  it("logout deletes the current session token when present, clears cookies, and redirects", async () => {
    await expect(logoutAction()).rejects.toMatchObject({ url: "/login" });

    expect(mocks.deleteSessionByToken).toHaveBeenCalledWith("session-token");
    expect(mocks.clearAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("logout still clears cookies when there is no session token", async () => {
    mocks.cookies.mockResolvedValueOnce(createCookieStore(null));

    await expect(logoutAction()).rejects.toMatchObject({ url: "/login" });

    expect(mocks.deleteSessionByToken).not.toHaveBeenCalled();
    expect(mocks.clearAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("profile update trims whitespace and persists the normalized name", async () => {
    const formData = new FormData();
    formData.append("name", "  Alice Johnson  ");

    await expect(updateProfileAction(undefined, formData)).resolves.toEqual({
      success: true,
      updatedName: "Alice Johnson",
    });

    expect(mocks.updateUserName).toHaveBeenCalledWith("user-1", "Alice Johnson");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("profile update rejects blank names without touching the database", async () => {
    const formData = new FormData();
    formData.append("name", "   ");

    await expect(updateProfileAction(undefined, formData)).resolves.toEqual({
      error: "Please enter a valid display name.",
    });

    expect(mocks.updateUserName).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("changePassword rejects missing form fields", async () => {
    const formData = new FormData();
    formData.append("currentPassword", "old-password");

    await expect(changePasswordAction(undefined, formData)).resolves.toEqual({
      error: "Please provide both your current and new password.",
    });

    expect(mocks.getUserById).not.toHaveBeenCalled();
  });

  it("changePassword rejects when the backing user row is missing", async () => {
    const formData = new FormData();
    formData.append("currentPassword", "old-password");
    formData.append("newPassword", "new-password");
    mocks.getUserById.mockResolvedValueOnce(null);

    await expect(changePasswordAction(undefined, formData)).resolves.toEqual({
      error: "Please provide both your current and new password.",
    });

    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("changePassword maps malformed stored hashes to password mismatch", async () => {
    const formData = new FormData();
    formData.append("currentPassword", "old-password");
    formData.append("newPassword", "new-password");
    mocks.verifyPassword.mockRejectedValueOnce(new Error("bad hash"));

    await expect(changePasswordAction(undefined, formData)).resolves.toEqual({
      error: "Your current password was incorrect.",
    });

    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it("changePassword rejects weak new passwords and returns the validator feedback", async () => {
    const formData = new FormData();
    formData.append("currentPassword", "old-password");
    formData.append("newPassword", "12345678");
    mocks.validatePasswordStrength.mockReturnValueOnce({
      valid: false,
      feedback: "too weak",
      strength: 1,
    });

    await expect(changePasswordAction(undefined, formData)).resolves.toEqual({
      error: "too weak",
    });

    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it("changePassword hashes and stores the new password on success", async () => {
    const formData = new FormData();
    formData.append("currentPassword", "old-password");
    formData.append("newPassword", "StrongPass!2026");

    await expect(changePasswordAction(undefined, formData)).resolves.toEqual({ success: true });

    expect(mocks.verifyPassword).toHaveBeenCalledWith("old-password", "stored-hash");
    expect(mocks.hashPassword).toHaveBeenCalledWith("StrongPass!2026");
    expect(mocks.updateUserPassword).toHaveBeenCalledWith("user-1", "hashed-new-password");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("revokeSession rejects missing session ids", async () => {
    const formData = new FormData();

    await expect(revokeSessionAction(formData)).rejects.toMatchObject({
      url: "/settings?status=invalid-session",
    });

    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it("revokeSession logs out the current device when its session is revoked", async () => {
    const formData = new FormData();
    formData.append("sessionId", "session-1");

    await expect(revokeSessionAction(formData)).rejects.toMatchObject({ url: "/login" });

    expect(mocks.deleteSession).toHaveBeenCalledWith("session-1");
    expect(mocks.clearAuthCookies).toHaveBeenCalledTimes(1);
  });

  it("revokeSession rejects session ids that do not belong to the user", async () => {
    const formData = new FormData();
    formData.append("sessionId", "session-999");

    await expect(revokeSessionAction(formData)).rejects.toMatchObject({
      url: "/settings?status=invalid-session",
    });

    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it("revokeSession deletes another known device and redirects back to settings", async () => {
    const formData = new FormData();
    formData.append("sessionId", "session-2");

    await expect(revokeSessionAction(formData)).rejects.toMatchObject({
      url: "/settings?status=session-revoked",
    });

    expect(mocks.deleteSession).toHaveBeenCalledWith("session-2");
    expect(mocks.clearAuthCookies).not.toHaveBeenCalled();
  });

  it("revokeOtherSessions removes only the other sessions when the current device is known", async () => {
    await expect(revokeOtherSessionsAction()).rejects.toMatchObject({
      url: "/settings?status=other-sessions-revoked",
    });

    expect(mocks.deleteOtherSessions).toHaveBeenCalledWith("user-1", "session-1");
    expect(mocks.deleteAllSessions).not.toHaveBeenCalled();
    expect(mocks.clearAuthCookies).not.toHaveBeenCalled();
  });

  it("revokeOtherSessions falls back to deleting everything and clearing cookies when the current session cannot be resolved", async () => {
    mocks.getSessionByToken.mockResolvedValueOnce(null);

    await expect(revokeOtherSessionsAction()).rejects.toMatchObject({ url: "/login" });

    expect(mocks.deleteAllSessions).toHaveBeenCalledWith("user-1");
    expect(mocks.clearAuthCookies).toHaveBeenCalledTimes(1);
    expect(mocks.deleteOtherSessions).not.toHaveBeenCalled();
  });
});
