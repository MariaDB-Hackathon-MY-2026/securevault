import type { FileListItem } from "@/lib/files/types";

export const filesQueryKey = ["files"] as const;

export async function fetchFiles(): Promise<FileListItem[]> {
  const response = await fetch("/api/files", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Failed to fetch files");
  }

  const payload = (await response.json()) as { files: FileListItem[] };
  return payload.files;
}
