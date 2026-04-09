"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchFilenameSearch,
  filenameSearchQueryKey,
} from "@/lib/search/filename-search-query";
import { normalizeFilenameSearchQuery } from "@/lib/search/filename-search-shared";

type UseFilenameSearchQueryOptions = {
  query: string;
};

export function useFilenameSearchQuery({ query }: UseFilenameSearchQueryOptions) {
  const normalizedQuery = normalizeFilenameSearchQuery(query);
  const enabled = normalizedQuery.length >= 2;

  return useQuery({
    enabled,
    queryFn: () => fetchFilenameSearch(normalizedQuery),
    queryKey: filenameSearchQueryKey(normalizedQuery),
    staleTime: 30_000,
  });
}
