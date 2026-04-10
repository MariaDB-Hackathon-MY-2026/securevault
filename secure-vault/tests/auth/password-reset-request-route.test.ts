import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRateLimitResponse: vi.fn(),
  enforceRateLimit: vi.fn(),
  requestPasswordResetOtp: vi.fn(),
}));

vi.mock("@/lib/auth/password-reset-service", () => ({
  requestPasswordResetOtp: mocks.requestPasswordResetOtp,
}));

vi.mock("@/lib/rate-limit", () => ({
  createRateLimitResponse: mocks.createRateLimitResponse,
  enforceRateLimit: mocks.enforceRateLimit,
  passwordResetRequestLimiter: {
    limit: 3,
    message: "Too many password reset requests. Please try again later.",
    prefix: "rate-limit:password-reset-request",
    windowSeconds: 900,
  },
}));

import { POST } from "@/app/api/auth/password-reset/request-otp/route";

function createRequest(body: unknown) {
  return new Request("https://example.com/api/auth/password-reset/request-otp", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "198.51.100.7",
    },
    method: "POST",
  });
}

describe("password reset request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.enforceRateLimit.mockResolvedValue({ success: true });
    mocks.createRateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ message: "Too many password reset requests. Please try again later." }), {
        headers: { "Retry-After": "900" },
        status: 429,
      }),
    );
    mocks.requestPasswordResetOtp.mockResolvedValue({ delivered: true, userFound: true });
  });

  it("returns validation errors for a missing email", async () => {
    const response = await POST(createRequest({}) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      fieldErrors: { email: ["Email is required"] },
      message: "Email is required",
    });
  });

  it("returns the same generic success payload for known emails", async () => {
    const response = await POST(createRequest({ email: "Alice@example.com" }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a verification code has been sent.",
      success: true,
    });
    expect(mocks.requestPasswordResetOtp).toHaveBeenCalledWith("alice@example.com");
  });

  it("returns the same generic success payload for unknown emails", async () => {
    mocks.requestPasswordResetOtp.mockResolvedValueOnce({ delivered: false, userFound: false });

    const response = await POST(createRequest({ email: "unknown@example.com" }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a verification code has been sent.",
      success: true,
    });
    expect(mocks.requestPasswordResetOtp).toHaveBeenCalledWith("unknown@example.com");
  });

  it("returns 429 when either limiter blocks the request", async () => {
    mocks.enforceRateLimit
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    const response = await POST(createRequest({ email: "alice@example.com" }) as never);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      message: "Too many password reset requests. Please try again later.",
    });
  });

  it("keeps the response generic when the service throws for a known account", async () => {
    mocks.requestPasswordResetOtp.mockRejectedValueOnce(new Error("database unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(createRequest({ email: "alice@example.com" }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a verification code has been sent.",
      success: true,
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("keeps the generic success payload when the service resolves after the minimum response delay", async () => {
    vi.useFakeTimers();
    mocks.requestPasswordResetOtp.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ delivered: true, userFound: true }), 300);
        }),
    );

    const responsePromise = POST(createRequest({ email: "alice@example.com" }) as never);
    await vi.advanceTimersByTimeAsync(300);
    const response = await responsePromise;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "If an account exists for that email, a verification code has been sent.",
      success: true,
    });
    expect(mocks.requestPasswordResetOtp).toHaveBeenCalledWith("alice@example.com");
  });
});
