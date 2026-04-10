import { NextRequest, NextResponse } from "next/server";

import { validatePasswordStrength } from "@/lib/auth/password-strength";
import { normalizeEmailAddress } from "@/lib/auth/otp";
import {
  isPasswordResetServiceError,
  resetPasswordWithOtp,
} from "@/lib/auth/password-reset-service";
import { getClientIpFromHeaders } from "@/lib/auth/request-metadata";
import {
  createRateLimitResponse,
  enforceRateLimit,
  passwordResetVerifyLimiter,
} from "@/lib/rate-limit";

type ResetPayload = {
  code?: unknown;
  email?: unknown;
  newPassword?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => null)) as ResetPayload | null;
    const email = typeof payload?.email === "string" ? payload.email : "";
    const code = typeof payload?.code === "string" ? payload.code : "";
    const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword : "";
    const fieldErrors: Record<string, string[]> = {};

    if (!email.trim()) {
      fieldErrors.email = ["Email is required"];
    }

    if (!code.trim()) {
      fieldErrors.code = ["Verification code is required"];
    } else if (!/^\d{6}$/.test(code.trim())) {
      fieldErrors.code = ["Verification code must be 6 digits"];
    }

    if (!newPassword) {
      fieldErrors.newPassword = ["New password is required"];
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          fieldErrors,
          message: "Please correct the highlighted fields.",
        },
        { status: 400 },
      );
    }

    const normalizedEmail = normalizeEmailAddress(email);
    const clientIp = getClientIpFromHeaders(request.headers);
    const [broadLimit, scopedLimit] = await Promise.all([
      enforceRateLimit(passwordResetVerifyLimiter, clientIp),
      enforceRateLimit(passwordResetVerifyLimiter, `${clientIp}:${normalizedEmail}`),
    ]);

    if (!broadLimit.success) {
      return createRateLimitResponse(broadLimit, passwordResetVerifyLimiter.message);
    }

    if (!scopedLimit.success) {
      return createRateLimitResponse(scopedLimit, passwordResetVerifyLimiter.message);
    }

    const passwordStrength = validatePasswordStrength(newPassword);

    if (!passwordStrength.valid) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          fieldErrors: { newPassword: [passwordStrength.feedback] },
          message: passwordStrength.feedback,
        },
        { status: 400 },
      );
    }

    await resetPasswordWithOtp({
      code: code.trim(),
      email: normalizedEmail,
      newPassword,
    });

    return NextResponse.json({
      message: "Password reset successful. Please log in again.",
      success: true,
    });
  } catch (error) {
    if (isPasswordResetServiceError(error)) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status: error.status },
      );
    }

    console.error("Password reset failed", error);
    return NextResponse.json(
      {
        error: "RESET_FAILED",
        message: "Failed to reset password",
      },
      { status: 500 },
    );
  }
}
