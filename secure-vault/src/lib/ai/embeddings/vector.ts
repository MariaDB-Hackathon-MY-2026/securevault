import "server-only";

import { getSemanticConfig } from "@/lib/ai/config";

export function normalizeVector(values: number[]) {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + (value * value), 0));

  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Cannot normalize an empty embedding vector.");
  }

  return values.map((value) => value / magnitude);
}

export function assertEmbeddingDimensions(values: number[]) {
  const { embeddingDimensions } = getSemanticConfig();

  if (values.length !== embeddingDimensions) {
    const error = new Error(
      `Expected embedding with ${embeddingDimensions} dimensions, received ${values.length}.`,
    );

    error.name = "VECTOR_DIMENSION_MISMATCH";
    throw error;
  }
}

export function serializeVector(values: number[]) {
  return `[${values.join(",")}]`;
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length) {
    throw new Error("Cannot compare vectors with different dimensions.");
  }

  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    sum += left[index]! * right[index]!;
  }

  return sum;
}
