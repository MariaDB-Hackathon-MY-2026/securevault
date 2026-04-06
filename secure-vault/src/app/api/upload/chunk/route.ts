import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  createRateLimitResponse,
  enforceRateLimit,
  uploadLimiter,
} from "@/lib/rate-limit";

import { UploadChunkServiceError, uploadChunk } from "./service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return createErrorResponse("Invalid credentials", 401);
    }

    const rateLimit = await enforceRateLimit(uploadLimiter, user.id);

    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit, uploadLimiter.message);
    }

    const result = await uploadChunk({
      body: req.body,
      headers: req.headers,
      user,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Chunk upload failed", error);

    if (error instanceof UploadChunkServiceError) {
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

    return createErrorResponse("Failed to upload chunk", 500);
  }
}

function createErrorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
