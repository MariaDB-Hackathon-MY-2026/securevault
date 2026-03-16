"use client";

import { useQuery } from "@tanstack/react-query";

import { currentUserQueryKey, type CurrentUserClient } from "@/lib/auth/current-user-client";

export function useCurrentUserQuery(initialUser: CurrentUserClient | null) {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: fetchCurrentUser,
    initialData: initialUser,
    staleTime: 60_000,
  });
}

async function fetchCurrentUser(): Promise<CurrentUserClient | null> {
  const response = await fetch("/api/auth/current-user", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Failed to fetch current user");
  }

  const payload = (await response.json()) as { user: CurrentUserClient };
  return payload.user;
}
