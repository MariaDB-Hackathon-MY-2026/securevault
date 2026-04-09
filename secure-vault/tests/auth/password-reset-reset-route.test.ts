import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRateLimitResponse: vi.fn(),
  enforceRateLimit: vi.fn(),
  hashPassword: vi.fn(),
  resetPasswordWithOtp: vi.fn(),
  validatePasswordStrength: vi.fn(),
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/auth/password-strength", () => ({
  validatePasswordStrength: mocks.validatePasswordStrength,
}));

vi.mock("@/lib/auth/password-reset-service", () => ({
  isPasswordResetServiceError: (error: unknown) =>
    Boolean(
      error
      && typeof error === "object"
      && "code" in (error as Record<string, unknown>)
      && "status" in (error as Record<string, unknown>),
  ),
  resetPasswordWithOtp: mocks.resetPasswordWithOtp,
}));

vi.mock("@/lib/rate-limit", () => ({
  createRateLimitResponse: mocks.createRateLimitResponse,
  enforceRateLimit: mocks.enforceRateLimit,
  passwordResetVerifyLimiter: {
    limit: 5,
    message: "Too many password reset attempts. Please try again later.",
    prefix: "rate-limit:password-reset-verify",
    windowSeconds: 900,
  },
}));

import { POST } from "@/app/api/auth/password-reset/reset/route";

function createRequest(body: unknown) {
  return new Request("https://example.com/api/auth/password-reset/reset", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "198.51.100.7",
    },
    method: "POST",
  });
}

describe("password reset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockResolvedValue({ success: true });
    mocks.createRateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ message: "Too many password reset attempts. Please try again later." }), {
        headers: { "Retry-After": "900" },
        status: 429,
      }),
    );
    mocks.validatePasswordStrength.mockReturnValue({
      feedback: "",
      strength: 4,
      valid: true,
    });
    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.resetPasswordWithOtp.mockResolvedValue(undefined);
  });

  it("returns validation errors for missing fields", async () => {
    const response = await POST(createRequest({ email: "" }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      fieldErrors: {
        code: ["Verification code is required"],
        email: ["Email is required"],
        newPassword: ["New password is required"],
      },
      message: "Please correct the highlighted fields.",
    });
  });

  it("returns validation errors for weak passwords", async () => {
    mocks.validatePasswordStrength.mockReturnValueOnce({
      feedback: "Use a longer and more unique password.",
      strength: 1,
      valid: false,
    });

    const response = await POST(
      createRequest({
        code: "123456",
        email: "alice@example.com",
        newPassword: "weak",
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "VALIDATION_ERROR",
      fieldErrors: {
        newPassword: ["Use a longer and more unique password."],
      },
      message: "Use a longer and more unique password.",
    });
  });

  it("maps OTP state errors to the documented response contract", async () => {
    mocks.resetPasswordWithOtp.mockRejectedValueOnce({
      code: "OTP_EXPIRED",
      message: "Verification code has expired",
      status: 403,
    });

    const response = await POST(
      createRequest({
        code: "123456",
        email: "alice@example.com",
        newPassword: "CorrectHorseBatteryStaple!2026",
      }) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "OTP_EXPIRED",
      message: "Verification code has expired",
    });
  });

  it("returns 429 before hashing or resetting when rate limited", async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({ success: false });

    const response = await POST(
      createRequest({
        code: "123456",
        email: "alice@example.com",
        newPassword: "CorrectHorseBatteryStaple!2026",
      }) as never,
    );

    expect(response.status).toBe(429);
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.resetPasswordWithOtp).not.toHaveBeenCalled();
  });

  it("returns the success payload after a successful reset", async () => {
    const response = await POST(
      createRequest({
        code: "123456",
        email: "Alice@example.com",
        newPassword: "CorrectHorseBatteryStaple!2026",
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Password reset successful. Please log in again.",
      success: true,
    });
    expect(mocks.hashPassword).toHaveBeenCalledWith("CorrectHorseBatteryStaple!2026");
    expect(mocks.resetPasswordWithOtp).toHaveBeenCalledWith({
      code: "123456",
      email: "alice@example.com",
      newPasswordHash: "hashed-password",
    });
  });
});
