import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { toRouteErrorResponse } from "@/lib/ai/embeddings/errors";
import { getSemanticConfig } from "@/lib/ai/config";
import { embedSemanticQuery } from "@/lib/search/semantic/query-embedder";
import { searchSemanticFiles } from "@/lib/search/semantic/semantic-search";

const requestSchema = z.object({
  limit: z.number().int().min(1).max(25).optional(),
  query: z.string().trim().min(2).max(500),
});

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
      toRouteErrorResponse("INVALID_REQUEST", "Semantic search requires a query between 2 and 500 characters and a limit between 1 and 25.", false),
      { status: 400 },
    );
  }

  try {
    const config = getSemanticConfig();
    if (!config.enabled) {
      return NextResponse.json(
        toRouteErrorResponse("SEMANTIC_INDEXING_DISABLED", "Semantic search is disabled.", false),
        { status: 503 },
      );
    }

    const limit = parsedBody.limit ?? 10;
    const queryVector = await embedSemanticQuery(parsedBody.query);
    const results = await searchSemanticFiles({
      limit,
      queryTopK: config.queryTopK,
      queryVector,
      userId: user.id,
    });

    return NextResponse.json({
      limit,
      query: parsedBody.query,
      results,
    });
  } catch (error) {
    if (isSemanticUnavailableError(error)) {
      return NextResponse.json(
        toRouteErrorResponse(
          "SEMANTIC_INDEXING_UNAVAILABLE",
          error instanceof Error ? error.message : "Semantic search is unavailable.",
          true,
        ),
        { status: 503 },
      );
    }

    console.error("Failed to run semantic search", error);
    return NextResponse.json(
      toRouteErrorResponse(
        "SEMANTIC_INDEXING_UNAVAILABLE",
        "Semantic search is unavailable.",
        true,
      ),
      { status: 503 },
    );
  }
}
