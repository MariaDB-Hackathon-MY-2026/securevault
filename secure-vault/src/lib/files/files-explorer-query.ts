import type { FilesExplorerData } from "@/lib/files/types";

export const filesExplorerQueryKey = ["files-explorer"] as const;

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export async function fetchFilesExplorer(): Promise<FilesExplorerData> {
  const response = await fetch("/api/files/explorer", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new AuthError();
  }

  if (!response.ok) {
    throw new Error("Failed to fetch file explorer data");
  }

  return (await response.json()) as FilesExplorerData;
}
