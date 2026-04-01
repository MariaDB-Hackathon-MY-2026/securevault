import type { FileListItem } from "@/lib/files/types";

export const filesQueryKey = ["files"] as const;

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export async function fetchFiles(): Promise<FileListItem[]> {
  const response = await fetch("/api/files", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new AuthError();
  }

  if (!response.ok) {
    throw new Error("Failed to fetch files");
  }

  const payload = (await response.json()) as { files: FileListItem[] };
  return payload.files;
}
