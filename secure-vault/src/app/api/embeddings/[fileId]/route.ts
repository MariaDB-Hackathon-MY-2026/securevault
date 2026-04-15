import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { EmbeddingJobNotFoundError, EmbeddingJobService } from "@/lib/ai/embeddings/embedding-job-service";
import { toRouteErrorResponse } from "@/lib/ai/embeddings/errors";

const service = new EmbeddingJobService();

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      toRouteErrorResponse("UNAUTHENTICATED", "Authentication is required.", false),
      { status: 401 },
    );
  }

  try {
    const { fileId } = await context.params;
    const response = await service.getStatus(user.id, fileId);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof EmbeddingJobNotFoundError) {
      return NextResponse.json(
        toRouteErrorResponse("NOT_FOUND", error.message, false),
        { status: 404 },
      );
    }

    console.error("Failed to fetch semantic indexing status", error);
    return NextResponse.json(
      toRouteErrorResponse(
        "SEMANTIC_INDEXING_UNAVAILABLE",
        "Semantic indexing status is unavailable.",
        true,
      ),
      { status: 503 },
    );
  }
}
