import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import { hashOtpCode } from "@/lib/auth/otp";
import {
  requestPasswordResetOtp,
  resetPasswordWithOtp,
} from "@/lib/auth/password-reset-service";

const mocks = vi.hoisted(() => ({
  deleteAllSessions: vi.fn(),
  safeCompare: vi.fn(),
  sendPasswordResetOtpEmail: vi.fn(),
  updateUserPassword: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "abcdefghijklm",
}));

vi.mock("@/lib/email", () => ({
  sendPasswordResetOtpEmail: mocks.sendPasswordResetOtpEmail,
}));

vi.mock("@/lib/crypto/timing", () => ({
  safeCompare: mocks.safeCompare,
}));

vi.mock("@/lib/db/crud/user", () => ({
  updateUserPassword: mocks.updateUserPassword,
}));

vi.mock("@/lib/auth/session", () => ({
  deleteAllSessions: mocks.deleteAllSessions,
}));

function createSelectHarness(selectResults: unknown[][] = []) {
  const selectQueue = [...selectResults];
  const selectLimit = vi.fn(async () => selectQueue.shift() ?? []);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const insertValues = vi.fn(async () => ({}));
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn(async () => ({ affectedRows: 1 }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn(async () => ({ affectedRows: 1 }));
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  return {
    db: {
      delete: deleteFn,
      insert,
      select,
      update,
    },
    spies: {
      deleteFn,
      deleteWhere,
      insertValues,
      updateSet,
      updateWhere,
    },
  };
}

function createResetTransactionHarness(input: {
  executeResults: unknown[];
  userResult?: unknown[];
  updateResults?: unknown[];
}) {
  const executeQueue = [...input.executeResults];
  const updateQueue = [...(input.updateResults ?? [{ affectedRows: 1 }])];
  const selectLimit = vi.fn(async () => input.userResult ?? []);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const execute = vi.fn(async () => executeQueue.shift() ?? []);
  const updateWhere = vi.fn(async () => updateQueue.shift() ?? { affectedRows: 1 });
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const tx = { execute, select, update };
  const db = {
    transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) => callback(tx)),
  };

  return {
    db,
    spies: {
      execute,
      transaction: db.transaction,
      updateSet,
      updateWhere,
    },
  };
}

function makeTokenRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    attemptCount: 0,
    createdAt: "2030-04-09T08:00:00.000Z",
    expiresAt: "2030-04-09T08:05:00.000Z",
    id: "0000abcdabcdefghijklm",
    tokenHash: "hashed-code",
    usedAt: null,
    userId: "user-123",
    ...overrides,
  };
}

function wrapRows(rows: unknown[]) {
  return [rows];
}

describe("password reset service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
    mocks.safeCompare.mockImplementation((left, right) => left === right);
    mocks.sendPasswordResetOtpEmail.mockResolvedValue(undefined);
    mocks.updateUserPassword.mockResolvedValue(undefined);
    mocks.deleteAllSessions.mockResolvedValue(undefined);
  });

  it("creates a hashed OTP row with attempt_count 0 and invalidates older active rows after delivery", async () => {
    const harness = createSelectHarness([[{ email: "alice@example.com", id: "user-123" }]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(requestPasswordResetOtp(" Alice@example.com ")).resolves.toEqual({
      delivered: true,
      userFound: true,
    });

    expect(harness.spies.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt_count: 0,
        expires_at: expect.any(Date),
        token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        user_id: "user-123",
      }),
    );
    expect(mocks.sendPasswordResetOtpEmail).toHaveBeenCalledWith(
      "alice@example.com",
      expect.stringMatching(/^\d{6}$/),
    );
    expect(harness.spies.updateWhere).toHaveBeenCalledTimes(1);
  });

  it("retires the newly created OTP when delivery fails without invalidating older active rows", async () => {
    const harness = createSelectHarness([[{ email: "alice@example.com", id: "user-123" }]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.sendPasswordResetOtpEmail.mockRejectedValueOnce(new Error("mail unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(requestPasswordResetOtp("alice@example.com")).resolves.toEqual({
      delivered: false,
      userFound: true,
    });

    expect(harness.spies.updateSet).toHaveBeenCalledWith({ used_at: expect.any(Date) });
    expect(harness.spies.updateWhere).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("logs resend cleanup failures but keeps the newly delivered code active", async () => {
    const harness = createSelectHarness([[{ email: "alice@example.com", id: "user-123" }]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    harness.spies.updateWhere.mockRejectedValueOnce(new Error("cleanup failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(requestPasswordResetOtp("alice@example.com")).resolves.toEqual({
      delivered: true,
      userFound: true,
    });

    expect(mocks.sendPasswordResetOtpEmail).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Password reset OTP resend cleanup failed",
      expect.objectContaining({
        email: "alice@example.com",
        flow: "password-reset",
        tokenId: expect.any(String),
        userId: "user-123",
      }),
    );
  });

  it("returns generic unknown-user behavior without attempting delivery", async () => {
    const harness = createSelectHarness([[]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(requestPasswordResetOtp("missing@example.com")).resolves.toEqual({
      delivered: false,
      userFound: false,
    });

    expect(mocks.sendPasswordResetOtpEmail).not.toHaveBeenCalled();
    expect(harness.spies.insertValues).not.toHaveBeenCalled();
  });

  it("increments attempt count and returns OTP_INVALID for a wrong code", async () => {
    const harness = createResetTransactionHarness({
      executeResults: [wrapRows([makeTokenRow()]), wrapRows([])],
      userResult: [{ email: "alice@example.com", id: "user-123" }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      resetPasswordWithOtp({
        code: "000000",
        email: "alice@example.com",
        newPasswordHash: "next-hash",
      }),
    ).rejects.toMatchObject({
      code: "OTP_INVALID",
      status: 403,
    });

    expect(harness.spies.updateSet).toHaveBeenCalledWith({ attempt_count: 1 });
    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it("locks the OTP after the final allowed failed attempt", async () => {
    const harness = createResetTransactionHarness({
      executeResults: [wrapRows([makeTokenRow({ attemptCount: 2 })]), wrapRows([])],
      userResult: [{ email: "alice@example.com", id: "user-123" }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      resetPasswordWithOtp({
        code: "999999",
        email: "alice@example.com",
        newPasswordHash: "next-hash",
      }),
    ).rejects.toMatchObject({
      code: "OTP_LOCKED",
      status: 403,
    });

    expect(harness.spies.updateSet).toHaveBeenCalledWith({ attempt_count: 3 });
  });

  it("returns OTP_USED when the submitted code was already consumed", async () => {
    const harness = createResetTransactionHarness({
      executeResults: [
        wrapRows([makeTokenRow()]),
        wrapRows([makeTokenRow({ usedAt: "2026-04-09T08:01:00.000Z" })]),
      ],
      userResult: [{ email: "alice@example.com", id: "user-123" }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      resetPasswordWithOtp({
        code: "123456",
        email: "alice@example.com",
        newPasswordHash: "next-hash",
      }),
    ).rejects.toMatchObject({
      code: "OTP_USED",
      status: 403,
    });

    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
    expect(mocks.deleteAllSessions).not.toHaveBeenCalled();
  });

  it("returns OTP_USED when another request consumes the OTP before this transaction updates it", async () => {
    const harness = createResetTransactionHarness({
      executeResults: [
        wrapRows([makeTokenRow({ tokenHash: hashOtpCode("123456") })]),
        wrapRows([makeTokenRow({ tokenHash: hashOtpCode("123456") })]),
      ],
      updateResults: [{ affectedRows: 0 }],
      userResult: [{ email: "alice@example.com", id: "user-123" }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      resetPasswordWithOtp({
        code: "123456",
        email: "alice@example.com",
        newPasswordHash: "next-hash",
      }),
    ).rejects.toMatchObject({
      code: "OTP_USED",
      status: 403,
    });

    expect(mocks.updateUserPassword).not.toHaveBeenCalled();
  });

  it("updates the password, consumes the OTP, and invalidates all sessions on success", async () => {
    const harness = createResetTransactionHarness({
      executeResults: [
        wrapRows([makeTokenRow({ tokenHash: hashOtpCode("123456") })]),
        wrapRows([makeTokenRow({ tokenHash: hashOtpCode("123456") })]),
      ],
      updateResults: [{ affectedRows: 1 }],
      userResult: [{ email: "alice@example.com", id: "user-123" }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      resetPasswordWithOtp({
        code: "123456",
        email: "alice@example.com",
        newPasswordHash: "next-hash",
      }),
    ).resolves.toBeUndefined();

    expect(harness.spies.updateSet).toHaveBeenCalledWith({ used_at: expect.any(Date) });
    expect(mocks.updateUserPassword).toHaveBeenCalledWith("user-123", "next-hash", expect.any(Object));
    expect(mocks.deleteAllSessions).toHaveBeenCalledWith("user-123", expect.any(Object));
  });
});
