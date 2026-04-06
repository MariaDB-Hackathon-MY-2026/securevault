import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createRateLimitResponse,
  enforceRateLimit,
  uploadLimiter,
} from "@/lib/rate-limit";
import {
  releaseUploadSlot,
  requireOwnedUploadSession,
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

    await requireOwnedUploadSession(user.id, validatedBody.uploadId);
    await releaseUploadSlot({
      uploadId: validatedBody.uploadId,
      userId: user.id,
    });

    return NextResponse.json({ released: true, uploadId: validatedBody.uploadId }, { status: 200 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
    }

    if (error instanceof UploadConcurrencyError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error("Upload slot release failed", error);
    return NextResponse.json(
      { message: "Failed to release upload slot" },
      { status: 500 },
    );
  }
}
