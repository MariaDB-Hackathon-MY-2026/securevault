import { AuthError } from "@/lib/files/files-explorer-query";
import type { FilenameSearchResponse } from "@/lib/search/types";

export function filenameSearchQueryKey(query: string) {
  return ["filename-search", query] as const;
}

export async function fetchFilenameSearch(query: string): Promise<FilenameSearchResponse> {
  const response = await fetch(`/api/search/files?q=${encodeURIComponent(query)}`, {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new AuthError();
  }

  if (!response.ok) {
    throw new Error("Failed to search files");
  }

  return (await response.json()) as FilenameSearchResponse;
}
