import { NextRequest, NextResponse } from "next/server";

import { createShareAccessSession } from "@/lib/sharing/share-access-session";
import { isShareOrOtpError, verifyOtp } from "@/lib/sharing/otp-service";
import { recordShareAccess } from "@/lib/sharing/share-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const payload = (await request.json().catch(() => null)) as {
      code?: unknown;
      email?: unknown;
    } | null;
    const email = typeof payload?.email === "string" ? payload.email : "";
    const code = typeof payload?.code === "string" ? payload.code : "";

    if (!email.trim() || !code.trim()) {
      return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
    }

    const verified = await verifyOtp({ code, email, token });
    const expiresAt = verified.linkExpiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

    await createShareAccessSession({
      email: verified.email,
      expiresAt,
      linkId: verified.linkId,
    });

    await recordShareAccess({
      email: verified.email,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      linkId: verified.linkId,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isShareOrOtpError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Share OTP verification failed", error);
    return NextResponse.json({ error: "Failed to verify code" }, { status: 500 });
  }
}
