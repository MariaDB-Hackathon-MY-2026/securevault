import "server-only";

import { sql } from "drizzle-orm";

import { serializeVector } from "@/lib/ai/embeddings/vector";

export function buildSemanticSimilaritySql(queryVector: number[]) {
  const serialized = serializeVector(queryVector);
  return sql<number>`1 - vec_distance_cosine(embedding, VEC_FromText(${serialized}))`;
}
