import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";

import { UploadChunkServiceError, uploadChunk } from "./service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return createErrorResponse("Invalid credentials", 401);
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
      return createErrorResponse(error.message, error.status);
    }

    return createErrorResponse("Failed to upload chunk", 500);
  }
}

function createErrorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
