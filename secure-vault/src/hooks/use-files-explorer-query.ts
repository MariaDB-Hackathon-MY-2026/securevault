"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchFilesExplorer,
  filesExplorerQueryKey,
} from "@/lib/files/files-explorer-query";
import type { FilesExplorerData } from "@/lib/files/types";

export function useFilesExplorerQuery(initialData: FilesExplorerData) {
  return useQuery({
    initialData,
    queryFn: fetchFilesExplorer,
    queryKey: filesExplorerQueryKey,
    staleTime: 30_000,
  });
}
