"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchStorageDashboard,
  storageDashboardQueryKey,
} from "@/lib/files/storage-dashboard-query";
import type { StorageDashboardData } from "@/lib/files/types";

export function useStorageDashboardQuery(initialData: StorageDashboardData) {
  return useQuery({
    initialData,
    queryFn: fetchStorageDashboard,
    queryKey: storageDashboardQueryKey,
    staleTime: 30_000,
  });
}
