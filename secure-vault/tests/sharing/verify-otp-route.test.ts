import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRateLimitResponse: vi.fn(),
  createShareAccessSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordShareAccess: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/sharing/otp-service", () => ({
  isShareOrOtpError: (error: unknown) =>
    Boolean(
      error
      && typeof error === "object"
      && "status" in (error as Record<string, unknown>)
      && "message" in (error as Record<string, unknown>),
    ),
  verifyOtp: mocks.verifyOtp,
}));

vi.mock("@/lib/sharing/share-access-session", () => ({
  createShareAccessSession: mocks.createShareAccessSession,
}));

vi.mock("@/lib/sharing/share-service", () => ({
  recordShareAccess: mocks.recordShareAccess,
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");

  return {
    ...actual,
    createRateLimitResponse: mocks.createRateLimitResponse,
    enforceRateLimit: mocks.enforceRateLimit,
  };
});

import { POST } from "@/app/api/share/[token]/verify-otp/route";

function createRequest(body: unknown) {
  return new Request("https://example.com/api/share/token/verify-otp", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "198.51.100.7, 198.51.100.8",
      "user-agent": "Vitest Browser",
    },
    method: "POST",
  });
}

describe("verify otp route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ success: true });
    mocks.createRateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ message: "Too many verification attempts" }), {
        headers: { "Retry-After": "300" },
        status: 429,
      }),
    );
  });

  it("returns 400 when email or code is missing", async () => {
    const response = await POST(createRequest({ email: "reader@example.com" }) as never, {
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Email and code are required",
    });
  });

  it("creates a session and access log on success", async () => {
    mocks.verifyOtp.mockResolvedValue({
      email: "reader@example.com",
      linkExpiresAt: new Date("2026-05-01T00:00:00.000Z"),
      linkId: "link-1",
    });

    const response = await POST(
      createRequest({ code: "123456", email: "reader@example.com" }) as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.createShareAccessSession).toHaveBeenCalledWith({
      email: "reader@example.com",
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      linkId: "link-1",
    });
    expect(mocks.recordShareAccess).toHaveBeenCalledWith({
      email: "reader@example.com",
      ipAddress: "198.51.100.7",
      linkId: "link-1",
      userAgent: "Vitest Browser",
    });
  });

  it("returns 429 before verification when the route is rate limited", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ success: false });

    const response = await POST(
      createRequest({ code: "123456", email: "reader@example.com" }) as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.createShareAccessSession).not.toHaveBeenCalled();
  });

  it("maps otp verification errors to their status codes", async () => {
    mocks.verifyOtp.mockRejectedValueOnce({
      code: "OTP_INVALID",
      message: "Invalid verification code",
      status: 403,
    });

    const response = await POST(
      createRequest({ code: "000000", email: "reader@example.com" }) as never,
      { params: Promise.resolve({ token: "share-token" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Invalid verification code" });
    expect(mocks.createShareAccessSession).not.toHaveBeenCalled();
  });
});
