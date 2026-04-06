import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createRateLimitResponse,
  enforceRateLimit,
  uploadLimiter,
} from "@/lib/rate-limit";

import {
  getUploadStatus,
  UploadStatusServiceError,
  validateUploadStatusSearchParams,
} from "./service";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return createErrorResponse("Invalid credentials", 401);
    }

    const rateLimit = await enforceRateLimit(uploadLimiter, user.id);

    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit, uploadLimiter.message);
    }

    const input = validateUploadStatusSearchParams(req.nextUrl.searchParams);
    const result = await getUploadStatus(user, input);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Upload status lookup failed", error);

    if (error instanceof UploadStatusServiceError) {
      return createErrorResponse(error.message, error.status);
    }

    return createErrorResponse("Failed to fetch upload status", 500);
  }
}

function createErrorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
