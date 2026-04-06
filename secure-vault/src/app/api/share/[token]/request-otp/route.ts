import { NextRequest, NextResponse } from "next/server";

import { getClientIpFromHeaders } from "@/lib/auth/request-metadata";
import {
  createRateLimitResponse,
  enforceRateLimit,
  otpRequestLimiter,
} from "@/lib/rate-limit";
import { createAndSendOtp, isShareOrOtpError } from "@/lib/sharing/otp-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const rateLimit = await enforceRateLimit(
      otpRequestLimiter,
      `${getClientIpFromHeaders(request.headers)}:${token}`,
    );

    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit, otpRequestLimiter.message);
    }

    const payload = (await request.json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof payload?.email === "string" ? payload.email : "";

    if (!email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    await createAndSendOtp({ email, token });
    return NextResponse.json({
      message: "If the email is allowed, a code has been sent.",
      success: true,
    });
  } catch (error) {
    if (isShareOrOtpError(error)) {
      if (error.code === "EMAIL_NOT_ALLOWED") {
        return NextResponse.json({
          message: "If the email is allowed, a code has been sent.",
          success: true,
        });
      }

      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Share OTP request failed", error);
    return NextResponse.json({ error: "Failed to request verification code" }, { status: 500 });
  }
}
