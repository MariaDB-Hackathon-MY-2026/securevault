import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRateLimitResponse: vi.fn(),
  createAndSendOtp: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/sharing/otp-service", () => ({
  createAndSendOtp: mocks.createAndSendOtp,
  isShareOrOtpError: (error: unknown) =>
    Boolean(
      error
      && typeof error === "object"
      && "status" in (error as Record<string, unknown>)
      && "message" in (error as Record<string, unknown>),
    ),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");

  return {
    ...actual,
    createRateLimitResponse: mocks.createRateLimitResponse,
    enforceRateLimit: mocks.enforceRateLimit,
  };
});

import { POST } from "@/app/api/share/[token]/request-otp/route";

function createRequest(body: unknown) {
  return new Request("https://example.com/api/share/token/request-otp", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("request otp route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ success: true });
    mocks.createRateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ message: "Too many verification requests" }), {
        headers: { "Retry-After": "900" },
        status: 429,
      }),
    );
  });

  it("returns 400 when email is missing", async () => {
    const response = await POST(createRequest({}) as never, {
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Email is required" });
  });

  it("returns generic success when otp is created", async () => {
    mocks.createAndSendOtp.mockResolvedValue(undefined);

    const response = await POST(createRequest({ email: "reader@example.com" }) as never, {
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If the email is allowed, a code has been sent.",
      success: true,
    });
    expect(mocks.createAndSendOtp).toHaveBeenCalledWith({
      email: "reader@example.com",
      token: "share-token",
    });
  });

  it("returns 429 before creating an otp when the route is rate limited", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ success: false });

    const response = await POST(createRequest({ email: "reader@example.com" }) as never, {
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(mocks.createAndSendOtp).not.toHaveBeenCalled();
  });

  it("keeps the response generic for disallowed emails", async () => {
    mocks.createAndSendOtp.mockRejectedValueOnce({
      code: "EMAIL_NOT_ALLOWED",
      message: "If the email is allowed, a code has been sent.",
      status: 200,
    });

    const response = await POST(createRequest({ email: "blocked@example.com" }) as never, {
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If the email is allowed, a code has been sent.",
      success: true,
    });
  });

  it("maps expected service errors to status codes", async () => {
    mocks.createAndSendOtp.mockRejectedValueOnce({
      code: "EXPIRED",
      message: "Share link is expired",
      status: 410,
    });

    const response = await POST(createRequest({ email: "reader@example.com" }) as never, {
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ error: "Share link is expired" });
  });

  it("surfaces delivery failures without exposing a 500", async () => {
    mocks.createAndSendOtp.mockRejectedValueOnce({
      code: "DELIVERY_FAILED",
      message: "Failed to deliver verification code",
      status: 503,
    });

    const response = await POST(createRequest({ email: "reader@example.com" }) as never, {
      params: Promise.resolve({ token: "share-token" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Failed to deliver verification code" });
  });
});
