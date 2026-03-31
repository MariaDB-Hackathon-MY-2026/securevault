"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchFiles, filesQueryKey } from "@/lib/files/files-query";
import type { FileListItem } from "@/lib/files/types";

export function useFilesQuery(initialFiles: FileListItem[]) {
  return useQuery({
    queryKey: filesQueryKey,
    queryFn: fetchFiles,
    initialData: initialFiles,
    staleTime: 30_000,
  });
}
