import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import { createAndSendOtp } from "@/lib/sharing/otp-service";

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
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
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
});
