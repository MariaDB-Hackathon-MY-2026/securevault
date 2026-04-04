import { AuthError } from "@/lib/files/files-explorer-query";
import type { TrashPageData, TrashSummary } from "@/lib/trash/types";

export const trashQueryKey = ["trash"] as const;
export const trashSummaryQueryKey = ["trash-summary"] as const;

export async function fetchTrashPageData(): Promise<TrashPageData> {
  const response = await fetch("/api/files/trash", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new AuthError();
  }

  if (!response.ok) {
    throw new Error("Failed to fetch trash data");
  }

  return (await response.json()) as TrashPageData;
}

export async function fetchTrashSummary(): Promise<TrashSummary> {
  const response = await fetch("/api/files/trash/summary", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new AuthError();
  }

  if (!response.ok) {
    throw new Error("Failed to fetch trash summary");
  }

  return (await response.json()) as TrashSummary;
}
