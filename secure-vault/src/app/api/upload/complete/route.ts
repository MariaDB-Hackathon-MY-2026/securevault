import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createRateLimitResponse,
  enforceRateLimit,
  uploadLimiter,
} from "@/lib/rate-limit";
import { releaseUploadSlot } from "@/lib/upload/upload-concurrency";
import { completeUploadTransaction, validateBody } from "@/app/api/upload/complete/service";
import {
  BodyRequestErrorResponse,
  TransactionFailureErrorResponse,
} from "@/app/api/upload/complete/Error";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Invalid Credentials" }, { status: 403 });
  }

  const rateLimit = await enforceRateLimit(uploadLimiter, user.id);

  if (!rateLimit.success) {
    return createRateLimitResponse(rateLimit, uploadLimiter.message);
  }

  let uploadIdToRelease: string | null = null;

  try {
    const jsonBody = await req.json();
    const validatedBody = validateBody(jsonBody);
    uploadIdToRelease = validatedBody.uploadId;
    const transactionResult = await completeUploadTransaction(user, validatedBody);

    return NextResponse.json({ ...transactionResult }, { status: 200 });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
    }
    if (err instanceof BodyRequestErrorResponse) return err.getErrorResponse();
    if (err instanceof TransactionFailureErrorResponse) return err.getErrorResponse();
    console.error("[upload/complete] Unhandled error:", err);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  } finally {
    if (uploadIdToRelease) {
      try {
        await releaseUploadSlot({
          uploadId: uploadIdToRelease,
          userId: user.id,
        });
      } catch (releaseError) {
        console.error("[upload/complete] Failed to release upload slot:", releaseError);
      }
    }
  }
}
