import { AuthError } from "@/lib/files/files-explorer-query";
import type { StorageDashboardData } from "@/lib/files/types";

export const storageDashboardQueryKey = ["storage-dashboard"] as const;

export async function fetchStorageDashboard(): Promise<StorageDashboardData> {
  const response = await fetch("/api/files/storage-dashboard", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new AuthError();
  }

  if (!response.ok) {
    throw new Error("Failed to fetch storage dashboard");
  }

  return (await response.json()) as StorageDashboardData;
}
