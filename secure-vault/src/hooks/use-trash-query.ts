"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchTrashPageData, trashQueryKey } from "@/lib/trash/trash-query";
import type { TrashPageData } from "@/lib/trash/types";

export function useTrashQuery(initialData: TrashPageData) {
  return useQuery({
    initialData,
    queryFn: fetchTrashPageData,
    queryKey: trashQueryKey,
    staleTime: 30_000,
  });
}
