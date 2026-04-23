import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import { safeCompare } from "@/lib/crypto/timing";
import { createAndSendOtp, hashOtp, verifyOtp } from "@/lib/sharing/otp-service";

const mocks = vi.hoisted(() => ({
  assertShareLinkAccessible: vi.fn(),
  sendOTPEmail: vi.fn(),
  requireShareLinkByToken: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: () => "otp-1",
}));

vi.mock("@/lib/email", () => ({
  sendOTPEmail: mocks.sendOTPEmail,
}));

vi.mock("@/lib/crypto/timing", async () => {
  const actual = await vi.importActual<typeof import("@/lib/crypto/timing")>(
    "@/lib/crypto/timing",
  );

  return {
    ...actual,
    safeCompare: vi.fn(actual.safeCompare),
  };
});

vi.mock("@/lib/sharing/share-service", () => ({
  ShareServiceError: class ShareServiceError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  assertShareLinkAccessible: mocks.assertShareLinkAccessible,
  requireShareLinkByToken: mocks.requireShareLinkByToken,
}));

function createDbHarness(selectResults: unknown[][] = []) {
  const selectQueue = [...selectResults];
  const selectLimit = vi.fn(async () => selectQueue.shift() ?? []);
  const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
  const selectWhere = vi.fn(() => ({
    limit: selectLimit,
    orderBy: selectOrderBy,
  }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const insertValues = vi.fn(async () => ({}));
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn(async () => ({ affectedRows: 1 }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    db: {
      insert,
      select,
      update,
    },
    spies: {
      insert,
      insertValues,
      selectOrderBy,
      select,
      update,
      updateSet,
      updateWhere,
    },
  };
}

describe("otp service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
    mocks.requireShareLinkByToken.mockResolvedValue({
      allowedEmails: ["reader@example.com"],
      expires_at: null,
      id: "link-1",
      is_public: false,
      revoked_at: null,
    });
    vi.mocked(safeCompare).mockImplementation((a, b) => a === b);
  });

  it("cleans up the inserted otp when email delivery fails", async () => {
    const harness = createDbHarness([[{ email: "reader@example.com" }]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.sendOTPEmail.mockRejectedValue(new Error("Email delivery failed: sandbox restriction"));

    await expect(
      createAndSendOtp({ email: "reader@example.com", token: "share-token" }),
    ).rejects.toMatchObject({
      code: "DELIVERY_FAILED",
      status: 503,
    });

    expect(harness.spies.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "reader@example.com",
        id: "otp-1",
        link_id: "link-1",
      }),
    );
    expect(harness.spies.update).toHaveBeenCalledTimes(1);
    expect(mocks.sendOTPEmail).toHaveBeenCalledWith("reader@example.com", expect.any(String));
  });

  it("invalidates older otps only after a successful email send", async () => {
    const harness = createDbHarness([[{ email: "reader@example.com" }]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.sendOTPEmail.mockResolvedValue(undefined);

    await expect(
      createAndSendOtp({ email: "reader@example.com", token: "share-token" }),
    ).resolves.toBeUndefined();

    expect(harness.spies.update).toHaveBeenCalledTimes(2);
    expect(mocks.sendOTPEmail).toHaveBeenCalledWith("reader@example.com", expect.any(String));
  });

  it("verifies a correct code using safeCompare and marks the otp as used", async () => {
    const otpRow = {
      attempt_count: 0,
      email: "reader@example.com",
      expires_at: new Date("2026-05-01T00:05:00.000Z"),
      id: "otp-1",
      link_id: "link-1",
      otp_hash: hashOtp("123456"),
      used_at: null,
    };
    const harness = createDbHarness([[otpRow]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await verifyOtp({
      code: "123456",
      email: " Reader@example.com ",
      token: "share-token",
    });

    expect(result).toEqual({
      email: "reader@example.com",
      linkExpiresAt: null,
      linkId: "link-1",
    });
    expect(harness.spies.selectOrderBy).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(safeCompare).toHaveBeenCalledWith(otpRow.otp_hash, hashOtp("123456"));
    expect(harness.spies.updateSet).toHaveBeenCalledWith({
      used_at: expect.any(Date),
    });
  });

  it("increments the attempt count when the verification code is wrong", async () => {
    const otpRow = {
      attempt_count: 0,
      email: "reader@example.com",
      expires_at: new Date("2026-05-01T00:05:00.000Z"),
      id: "otp-1",
      link_id: "link-1",
      otp_hash: "a".repeat(64),
      used_at: null,
    };
    const harness = createDbHarness([[otpRow]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      verifyOtp({
        code: "000000",
        email: "reader@example.com",
        token: "share-token",
      }),
    ).rejects.toMatchObject({
      code: "OTP_INVALID",
      status: 403,
    });

    expect(safeCompare).toHaveBeenCalledWith(otpRow.otp_hash, hashOtp("000000"));
    expect(harness.spies.updateSet).toHaveBeenCalledWith({ attempt_count: 1 });
  });

  it("locks the otp after the final allowed failed attempt", async () => {
    const otpRow = {
      attempt_count: 2,
      email: "reader@example.com",
      expires_at: new Date("2026-05-01T00:05:00.000Z"),
      id: "otp-1",
      link_id: "link-1",
      otp_hash: "b".repeat(64),
      used_at: null,
    };
    const harness = createDbHarness([[otpRow]]);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      verifyOtp({
        code: "999999",
        email: "reader@example.com",
        token: "share-token",
      }),
    ).rejects.toMatchObject({
      code: "OTP_LOCKED",
      status: 403,
    });

    expect(harness.spies.updateSet).toHaveBeenCalledWith({ attempt_count: 3 });
  });
});
