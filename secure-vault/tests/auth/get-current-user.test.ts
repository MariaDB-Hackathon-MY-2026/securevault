import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  validateSession: vi.fn(),
  getUserById: vi.fn(),
  decryptUEK: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/auth/session", () => ({
  validateSession: mocks.validateSession,
}));

vi.mock("@/lib/db/crud/user", () => ({
  getUserById: mocks.getUserById,
}));

vi.mock("@/lib/crypto", () => ({
  decryptUEK: mocks.decryptUEK,
}));

import {
  getCurrentUser,
  requireCurrentUser,
  requireVerifiedUser,
} from "@/lib/auth/get-current-user";

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === "__Secure-session") {
          return { value: "session-token" };
        }

        return undefined;
      }),
    });
    mocks.validateSession.mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      storage_used: 128,
      storage_quota: 1024,
      email_verified: true,
      created_at: new Date("2026-03-17T00:00:00.000Z"),
    });
    mocks.getUserById.mockResolvedValue({
      id: "user-1",
      encrypted_uek: Buffer.from("encrypted-uek"),
    });
    mocks.decryptUEK.mockReturnValue(Buffer.from("decrypted-uek"));
  });

  it("returns null when the session cookie is missing", async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });

    await expect(getCurrentUser()).resolves.toBeNull();

    expect(mocks.validateSession).not.toHaveBeenCalled();
    expect(mocks.getUserById).not.toHaveBeenCalled();
  });

  it("returns null when the session token is invalid", async () => {
    mocks.validateSession.mockResolvedValueOnce(null);

    await expect(getCurrentUser()).resolves.toBeNull();

    expect(mocks.validateSession).toHaveBeenCalledWith("session-token");
    expect(mocks.getUserById).not.toHaveBeenCalled();
  });

  it("returns null when the backing user row no longer exists", async () => {
    mocks.getUserById.mockResolvedValueOnce(null);

    await expect(getCurrentUser()).resolves.toBeNull();

    expect(mocks.getUserById).toHaveBeenCalledWith("user-1");
    expect(mocks.decryptUEK).not.toHaveBeenCalled();
  });

  it("returns the sanitized session user plus decrypted UEK", async () => {
    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      storage_used: 128,
      storage_quota: 1024,
      email_verified: true,
      created_at: new Date("2026-03-17T00:00:00.000Z"),
      uek: Buffer.from("decrypted-uek"),
    });

    expect(mocks.decryptUEK).toHaveBeenCalledWith(Buffer.from("encrypted-uek"));
  });

  it("propagates decryption failures instead of silently masking them", async () => {
    mocks.decryptUEK.mockImplementationOnce(() => {
      throw new Error("decrypt failed");
    });

    await expect(getCurrentUser()).rejects.toThrow("decrypt failed");
  });
});

describe("requireCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
  });

  it("throws Unauthorized when there is no current user", async () => {
    await expect(requireCurrentUser()).rejects.toThrow("Unauthorized");
  });
});

describe("requireVerifiedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: "session-token" })),
    });
    mocks.validateSession.mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      storage_used: 128,
      storage_quota: 1024,
      email_verified: false,
      created_at: new Date("2026-03-17T00:00:00.000Z"),
    });
    mocks.getUserById.mockResolvedValue({
      id: "user-1",
      encrypted_uek: Buffer.from("encrypted-uek"),
    });
    mocks.decryptUEK.mockReturnValue(Buffer.from("decrypted-uek"));
  });

  it("throws when the user is authenticated but unverified", async () => {
    await expect(requireVerifiedUser()).rejects.toThrow("Please verify your email");
  });

  it("returns the user when email is verified", async () => {
    mocks.validateSession.mockResolvedValueOnce({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      storage_used: 128,
      storage_quota: 1024,
      email_verified: true,
      created_at: new Date("2026-03-17T00:00:00.000Z"),
    });

    await expect(requireVerifiedUser()).resolves.toEqual({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      storage_used: 128,
      storage_quota: 1024,
      email_verified: true,
      created_at: new Date("2026-03-17T00:00:00.000Z"),
      uek: Buffer.from("decrypted-uek"),
    });
  });
});
