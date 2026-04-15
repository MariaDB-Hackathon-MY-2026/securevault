import { NextResponse } from "next/server";
import { z } from "zod";

import { getSemanticConfig } from "@/lib/ai/config";
import { EmbeddingJobService } from "@/lib/ai/embeddings/embedding-job-service";
import { toRouteErrorResponse } from "@/lib/ai/embeddings/errors";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const service = new EmbeddingJobService();

function isSemanticUnavailableError(error: unknown) {
  return error instanceof Error && (
    error.message.includes("GEMINI_API_KEY")
    || error.message.includes("Missing Gemini API key")
    || error.message.includes("Redis is required")
    || error.message.includes("queued requires REDIS_URL")
  );
}

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || !authorization) {
    return false;
  }

  return authorization === `Bearer ${cronSecret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      toRouteErrorResponse("FORBIDDEN", "Invalid cron credentials.", false),
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      toRouteErrorResponse("INVALID_REQUEST", "Invalid cron request.", false),
      { status: 400 },
    );
  }

  try {
    const config = getSemanticConfig();
    if (!config.enabled) {
      return NextResponse.json(
        toRouteErrorResponse("SEMANTIC_INDEXING_DISABLED", "Semantic indexing is disabled.", false),
        { status: 503 },
      );
    }

    const result = await service.requeueRetryCandidates(parsedQuery.data.limit ?? 25);

    return NextResponse.json(result);
  } catch (error) {
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

    console.error("Failed to run embeddings cron sweep", error);
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
