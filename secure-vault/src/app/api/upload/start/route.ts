import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createRateLimitResponse,
  enforceRateLimit,
  uploadLimiter,
} from "@/lib/rate-limit";
import {
  claimUploadSlot,
  requireOwnedActiveUploadSession,
  UploadConcurrencyError,
  validateUploadSlotBody,
} from "@/lib/upload/upload-concurrency";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
    }

    const rateLimit = await enforceRateLimit(uploadLimiter, user.id);

    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit, uploadLimiter.message);
    }

    const body = await req.json();
    const validatedBody = validateUploadSlotBody(body);

    await requireOwnedActiveUploadSession(user.id, validatedBody.uploadId);

    const claimResult = await claimUploadSlot({
      uploadId: validatedBody.uploadId,
      userId: user.id,
    });

    if (!claimResult.success) {
      const headers = new Headers();

      headers.set("Retry-After", String(claimResult.retryAfterSeconds));

      return NextResponse.json(
        {
          message: "Maximum active uploads reached. Waiting for a slot.",
          retryAfterSeconds: claimResult.retryAfterSeconds,
        },
        {
          headers,
          status: 429,
        },
      );
    }

    return NextResponse.json(
      {
        activeCount: claimResult.activeCount,
        maxActiveUploads: claimResult.maxActiveUploads,
        uploadId: validatedBody.uploadId,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
    }

    if (error instanceof UploadConcurrencyError) {
      const headers = new Headers();

      if (error.retryAfterSeconds) {
        headers.set("Retry-After", String(error.retryAfterSeconds));
      }

      return NextResponse.json(
        { message: error.message },
        {
          headers,
          status: error.status,
        },
      );
    }

    console.error("Upload slot claim failed", error);
    return NextResponse.json(
      { message: "Failed to claim an upload slot" },
      { status: 500 },
    );
  }
}
