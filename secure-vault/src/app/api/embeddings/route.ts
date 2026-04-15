import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { EmbeddingJobConflictError, EmbeddingJobNotFoundError, EmbeddingJobService } from "@/lib/ai/embeddings/embedding-job-service";
import { toRouteErrorResponse } from "@/lib/ai/embeddings/errors";
import { getSemanticConfig } from "@/lib/ai/config";

const requestSchema = z.object({
  action: z.enum(["enqueue", "retry", "reindex"]).optional(),
  fileId: z.string().trim().min(1),
  modality: z.enum(["image", "pdf"]),
});

const service = new EmbeddingJobService();

function isSemanticUnavailableError(error: unknown) {
  return error instanceof Error && (
    error.message.includes("GEMINI_API_KEY")
    || error.message.includes("Redis is required")
    || error.message.includes("queued requires REDIS_URL")
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      toRouteErrorResponse("UNAUTHENTICATED", "Authentication is required.", false),
      { status: 401 },
    );
  }

  let parsedBody: z.infer<typeof requestSchema>;

  try {
    parsedBody = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      toRouteErrorResponse("INVALID_REQUEST", "Invalid request body.", false),
      { status: 400 },
    );
  }

  try {
    getSemanticConfig();
    const response = await service.startJob({
      action: parsedBody.action,
      fileId: parsedBody.fileId,
      modality: parsedBody.modality,
      userId: user.id,
    });

    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    if (error instanceof EmbeddingJobNotFoundError) {
      return NextResponse.json(
        toRouteErrorResponse("NOT_FOUND", error.message, false),
        { status: 404 },
      );
    }

    if (error instanceof EmbeddingJobConflictError) {
      return NextResponse.json(
        toRouteErrorResponse("CONFLICT", error.message, false),
        { status: 409 },
      );
    }

    if (isSemanticUnavailableError(error)) {
      return NextResponse.json(
        toRouteErrorResponse(
          "SEMANTIC_INDEXING_UNAVAILABLE",
          error instanceof Error ? error.message : "Semantic indexing is unavailable.",
          true,
        ),
        { status: 503 },
      );
    }

    console.error("Failed to start semantic indexing job", error);
    return NextResponse.json(
      toRouteErrorResponse(
        "SEMANTIC_INDEXING_UNAVAILABLE",
        "Semantic indexing is unavailable.",
        true,
      ),
      { status: 503 },
    );
  }
}
