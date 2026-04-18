import "server-only";

import { getEmbeddingProvider } from "@/lib/ai/providers";
import { EmbeddingError } from "@/lib/ai/embeddings/errors";
import { assertEmbeddingDimensions, normalizeVector } from "@/lib/ai/embeddings/vector";

function normalizeProviderError(error: unknown) {
  if (error instanceof EmbeddingError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new EmbeddingError(
      "EMBEDDING_PROVIDER_TIMEOUT",
      "The embedding provider timed out while processing the request.",
      { cause: error },
    );
  }

  if (error instanceof Error && error.name === "VECTOR_DIMENSION_MISMATCH") {
    return new EmbeddingError(
      "VECTOR_DIMENSION_MISMATCH",
      "The embedding provider returned an unexpected vector length.",
      { cause: error, retryable: false },
    );
  }

  return new EmbeddingError(
    "EMBEDDING_PROVIDER_FAILED",
    error instanceof Error ? error.message : "The embedding provider failed to generate embeddings.",
    { cause: error },
  );
}

export async function embedBinaryForRetrieval(input: {
  bytes: Buffer;
  contextText: string;
  mimeType: string;
}) {
  try {
    const provider = getEmbeddingProvider();
    const values = await provider.embedBinary({
      bytes: input.bytes,
      contextText: input.contextText,
      mimeType: input.mimeType,
      task: "document",
    });

    assertEmbeddingDimensions(values);
    return normalizeVector(values);
  } catch (error) {
    throw normalizeProviderError(error);
  }
}

export async function embedQueryForRetrieval(query: string) {
  try {
    const provider = getEmbeddingProvider();
    const values = await provider.embedText({
      task: "query",
      text: query,
    });

    assertEmbeddingDimensions(values);
    return normalizeVector(values);
  } catch (error) {
    throw normalizeProviderError(error);
  }
}
