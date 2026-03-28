import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";

import {
  UploadInitServiceError,
  checkQuotaAndFileSize,
  initializeUpload,
  validateInitBody,
} from "./service";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return createErrorResponse("Invalid credentials", 401);
    }

    const parsedBody = await parseInitRequestBody(req);
    checkQuotaAndFileSize(user, parsedBody.fileSize);

    const uploadSessionRecord = await initializeUpload(user, parsedBody);
    return constructResponse(
      uploadSessionRecord.fileId,
      uploadSessionRecord.uploadId,
      uploadSessionRecord.totalChunks,
    );
  } catch (error) {
    console.error("Upload init failed", error);
    console.error(
      "Upload init failed cause",
      error && typeof error === "object" && "cause" in error
        ? (error as { cause?: unknown }).cause
        : undefined,
    );

    if (error instanceof UploadInitServiceError) {
      return createErrorResponse(error.message, error.status);
    }

    return createErrorResponse("Failed to initialize upload", 500);
  }
}

async function parseInitRequestBody(req: NextRequest) {
  try {
    const body = await req.json();
    return validateInitBody(body);
  } catch (error) {
    if (error instanceof UploadInitServiceError) {
      throw error;
    }

    throw new UploadInitServiceError("Invalid JSON request body", 400);
  }
}

function constructResponse(fileId: string, uploadId: string, totalChunks: number) {
  return NextResponse.json(
    {
      fileId,
      uploadId,
      totalChunks,
    },
    { status: 200 },
  );
}

function createErrorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}
