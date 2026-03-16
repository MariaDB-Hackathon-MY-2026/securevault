import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT_ERROR = new Error("NEXT_REDIRECT");

const mocks = vi.hoisted(() => ({
  hashPassword: vi.fn(),
  generateUEK: vi.fn(),
  encryptUEK: vi.fn(),
  createUser: vi.fn(),
  deleteUserById: vi.fn(),
  getRequestMetaData: vi.fn(),
  createSession: vi.fn(),
  setAuthCookies: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/crypto", () => ({
  generateUEK: mocks.generateUEK,
  encryptUEK: mocks.encryptUEK,
}));

vi.mock("@/lib/db/crud/user", () => ({
  createUser: mocks.createUser,
  deleteUserById: mocks.deleteUserById,
}));

vi.mock("@/lib/auth/request-metadata", () => ({
  getRequestMetaData: mocks.getRequestMetaData,
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: mocks.createSession,
}));

vi.mock("@/lib/auth/cookies", () => ({
  setAuthCookies: mocks.setAuthCookies,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { signupAction } from "@/app/(auth)/signup/actions";

function buildSignupFormData(overrides?: {
  name?: FormDataEntryValue | null;
  email?: FormDataEntryValue | null;
  password?: FormDataEntryValue | null;
}) {
  const formData = new FormData();

  if (overrides?.name !== null) {
    formData.append("name", overrides?.name ?? "Alice");
  }

  if (overrides?.email !== null) {
    formData.append("email", overrides?.email ?? "Alice@example.com");
  }

  if (overrides?.password !== null) {
    formData.append("password", overrides?.password ?? "CorrectHorseBatteryStaple!2026");
  }

  return formData;
}

describe("signupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.generateUEK.mockReturnValue(Buffer.from("generated-uek"));
    mocks.encryptUEK.mockReturnValue(Buffer.from("encrypted-uek"));
    mocks.createUser.mockResolvedValue("user-123");
    mocks.deleteUserById.mockResolvedValue(undefined);
    mocks.getRequestMetaData.mockResolvedValue({
      device_name: "Chrome on Windows",
      ip_address: "203.0.113.10",
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

  it("normalizes signup input, creates the user, records the device, sets cookies, and redirects", async () => {
    const formData = buildSignupFormData({
      name: "  Alice Johnson  ",
      email: "  Alice@Example.com  ",
      password: "CorrectHorseBatteryStaple!2026",
    });

    await expect(signupAction(undefined, formData)).rejects.toBe(REDIRECT_ERROR);

    expect(mocks.hashPassword).toHaveBeenCalledWith("CorrectHorseBatteryStaple!2026");
    expect(mocks.generateUEK).toHaveBeenCalledTimes(1);
    expect(mocks.encryptUEK).toHaveBeenCalledWith(Buffer.from("generated-uek"));
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "alice@example.com",
      name: "Alice Johnson",
      password_hash: "hashed-password",
      encrypted_uek: Buffer.from("encrypted-uek"),
    });
    expect(mocks.deleteUserById).not.toHaveBeenCalled();
    expect(mocks.getRequestMetaData).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).toHaveBeenCalledWith("user-123", {
      device_name: "Chrome on Windows",
      ip_address: "203.0.113.10",
    });
    expect(mocks.setAuthCookies).toHaveBeenCalledWith("session-token", "refresh-token");
    expect(mocks.redirect).toHaveBeenCalledWith("/activity");
  });

  it("returns a missing-fields error when any required field is absent", async () => {
    const formData = buildSignupFormData({ email: null });

    await expect(signupAction(undefined, formData)).resolves.toEqual({
      error: "Missing required fields",
    });

    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a missing-fields error when trimmed name or email becomes empty", async () => {
    const blankNameFormData = buildSignupFormData({ name: "   " });
    const blankEmailFormData = buildSignupFormData({ email: "   " });

    await expect(signupAction(undefined, blankNameFormData)).resolves.toEqual({
      error: "Missing required fields",
    });
    await expect(signupAction(undefined, blankEmailFormData)).resolves.toEqual({
      error: "Missing required fields",
    });

    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("rejects non-string FormData entries for required fields", async () => {
    const formData = buildSignupFormData({
      name: new File(["alice"], "avatar.png", { type: "image/png" }),
    });

    await expect(signupAction(undefined, formData)).resolves.toEqual({
      error: "Missing required fields",
    });

    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the email already exists", async () => {
    const duplicateEmailError = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const formData = buildSignupFormData();

    mocks.createUser.mockRejectedValueOnce(duplicateEmailError);

    await expect(signupAction(undefined, formData)).resolves.toEqual({
      error: "An account with this email already exists",
    });

    expect(mocks.deleteUserById).not.toHaveBeenCalled();
    expect(mocks.getRequestMetaData).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic error for unexpected database failures", async () => {
    const formData = buildSignupFormData();
    const failure = new Error("database unavailable");

    mocks.createUser.mockRejectedValueOnce(failure);

    await expect(signupAction(undefined, formData)).resolves.toEqual({
      error: "We couldn't create your account right now. Please try again.",
    });

    expect(mocks.deleteUserById).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic error when session creation fails and cleans up the created user", async () => {
    const formData = buildSignupFormData();
    const failure = new Error("session creation failed");

    mocks.createSession.mockRejectedValueOnce(failure);

    await expect(signupAction(undefined, formData)).resolves.toEqual({
      error: "We couldn't create your account right now. Please try again.",
    });

    expect(mocks.deleteUserById).toHaveBeenCalledWith("user-123");
    expect(mocks.setAuthCookies).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic error when writing cookies fails and cleans up the created user", async () => {
    const formData = buildSignupFormData();
    const failure = new Error("cookie store unavailable");

    mocks.setAuthCookies.mockRejectedValueOnce(failure);

    await expect(signupAction(undefined, formData)).resolves.toEqual({
      error: "We couldn't create your account right now. Please try again.",
    });

    expect(mocks.deleteUserById).toHaveBeenCalledWith("user-123");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

