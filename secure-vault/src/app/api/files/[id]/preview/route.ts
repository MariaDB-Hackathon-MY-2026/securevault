import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createRateLimitResponse,
  downloadLimiter,
  enforceRateLimit,
} from "@/lib/rate-limit";
import { FileDownloadServiceError, streamOwnedFile } from "@/app/api/files/[id]/service";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return createErrorResponse("Invalid credentials", 401);
    }

    const rateLimit = await enforceRateLimit(downloadLimiter, user.id);

    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit, downloadLimiter.message);
    }

    const { id } = await context.params;
    return await streamOwnedFile({
      disposition: "inline",
      fileId: id,
      signal: req.signal,
      user,
    });
  } catch (error) {
    console.error("File preview failed", error);

    if (error instanceof FileDownloadServiceError) {
      return createErrorResponse(error.message, error.status);
    }

    return createErrorResponse("Failed to stream file", 500);
  }
}

function createErrorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
