"use client";

import { useQuery } from "@tanstack/react-query";

import { AuthError } from "@/lib/files/files-explorer-query";
import type { SemanticSearchResponse } from "@/lib/search/types";

export class SemanticSearchDisabledError extends Error {
  constructor(message = "Semantic search is disabled.") {
    super(message);
    this.name = "SemanticSearchDisabledError";
  }
}

export class SemanticSearchUnavailableError extends Error {
  constructor(message = "Semantic search is unavailable.") {
    super(message);
    this.name = "SemanticSearchUnavailableError";
  }
}

export function semanticSearchQueryKey(query: string, limit: number) {
  return ["semantic-search", query, limit] as const;
}

async function fetchSemanticSearch(query: string, limit: number): Promise<SemanticSearchResponse> {
  const response = await fetch("/api/search/semantic", {
    body: JSON.stringify({ limit, query }),
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (response.status === 401) {
    throw new AuthError();
  }

  if (response.status === 503) {
    const payload = await response.json() as { errorCode?: string; message?: string };
    if (payload.errorCode === "SEMANTIC_INDEXING_DISABLED") {
      throw new SemanticSearchDisabledError(payload.message);
    }

    throw new SemanticSearchUnavailableError(payload.message);
  }

  if (!response.ok) {
    throw new Error("Failed to search semantically");
  }

  return (await response.json()) as SemanticSearchResponse;
}

export function useSemanticSearchQuery(input: {
  enabled: boolean;
  limit?: number;
  query: string;
}) {
  const normalizedQuery = input.query.trim();
  const limit = input.limit ?? 10;
  const enabled = input.enabled && normalizedQuery.length >= 2;

  return useQuery({
    enabled,
    queryFn: () => fetchSemanticSearch(normalizedQuery, limit),
    queryKey: semanticSearchQueryKey(normalizedQuery, limit),
    staleTime: 30_000,
  });
}
