"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchFilenameSearch,
  filenameSearchQueryKey,
} from "@/lib/search/filename-search-query";
import { normalizeFilenameSearchQuery } from "@/lib/search/filename-search";
import type { SearchMode } from "@/lib/search/types";

type UseFilenameSearchQueryOptions = {
  mode: SearchMode;
  query: string;
};

export function useFilenameSearchQuery({ mode, query }: UseFilenameSearchQueryOptions) {
  const normalizedQuery = normalizeFilenameSearchQuery(query);
  const enabled = mode === "filename" && normalizedQuery.length >= 2;

  return useQuery({
    enabled,
    queryFn: () => fetchFilenameSearch(normalizedQuery),
    queryKey: filenameSearchQueryKey(normalizedQuery),
    staleTime: 30_000,
  });
}
