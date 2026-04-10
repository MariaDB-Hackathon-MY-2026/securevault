import { NextRequest, NextResponse } from "next/server";

import { normalizeEmailAddress } from "@/lib/auth/otp";
import { getClientIpFromHeaders } from "@/lib/auth/request-metadata";
import { requestPasswordResetOtp } from "@/lib/auth/password-reset-service";
import {
  createRateLimitResponse,
  enforceRateLimit,
  passwordResetRequestLimiter,
} from "@/lib/rate-limit";

const GENERIC_SUCCESS_RESPONSE = {
  message: "If an account exists for that email, a verification code has been sent.",
  success: true,
};
const MIN_REQUEST_RESPONSE_MS = 250;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const rawEmail = typeof payload?.email === "string" ? payload.email : "";

    if (!rawEmail.trim()) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          fieldErrors: { email: ["Email is required"] },
          message: "Email is required",
        },
        { status: 400 },
      );
    }

    const email = normalizeEmailAddress(rawEmail);
    const clientIp = getClientIpFromHeaders(request.headers);
    const [broadLimit, scopedLimit] = await Promise.all([
      enforceRateLimit(passwordResetRequestLimiter, clientIp),
      enforceRateLimit(passwordResetRequestLimiter, `${clientIp}:${email}`),
    ]);

    if (!broadLimit.success) {
      return createRateLimitResponse(broadLimit, passwordResetRequestLimiter.message);
    }

    if (!scopedLimit.success) {
      return createRateLimitResponse(scopedLimit, passwordResetRequestLimiter.message);
    }

    await requestPasswordResetOtp(email).catch((error) => {
      console.error("Password reset OTP request failed", error);
    });
    await waitForMinimumResponseTime(startedAt);
    return NextResponse.json(GENERIC_SUCCESS_RESPONSE);
  } catch (error) {
    console.error("Password reset OTP request failed", error);
    await waitForMinimumResponseTime(startedAt);
    return NextResponse.json(GENERIC_SUCCESS_RESPONSE);
  }
}

async function waitForMinimumResponseTime(startedAt: number) {
  const elapsedMs = Date.now() - startedAt;
  const remainingMs = MIN_REQUEST_RESPONSE_MS - elapsedMs;

  if (remainingMs <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, remainingMs);
  });
}
