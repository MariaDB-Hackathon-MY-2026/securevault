"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchTrashSummary, trashSummaryQueryKey } from "@/lib/trash/trash-query";
import type { TrashSummary } from "@/lib/trash/types";

export function useTrashSummaryQuery(initialData?: TrashSummary) {
  return useQuery({
    ...(initialData ? { initialData } : {}),
    queryFn: fetchTrashSummary,
    queryKey: trashSummaryQueryKey,
    staleTime: 30_000,
  });
}
