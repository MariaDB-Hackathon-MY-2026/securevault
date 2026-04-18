import "server-only";

import { embedQueryForRetrieval } from "@/lib/ai/embeddings/embedder";

export function formatSemanticQuery(query: string) {
  return `task: search result | query: ${query.trim()}`;
}

export async function embedSemanticQuery(query: string) {
  return embedQueryForRetrieval(formatSemanticQuery(query));
}
