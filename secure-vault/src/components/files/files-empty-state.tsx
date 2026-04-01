"use client";

import { FolderTree } from "lucide-react";

type FilesEmptyStateProps = {
  hasFilter: boolean;
};

export function FilesEmptyState({ hasFilter }: FilesEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
        <FolderTree className="size-10 text-muted-foreground" />
        <p className="text-base font-medium">
          {hasFilter ? "No matching files or folders" : "This folder is empty"}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasFilter
            ? "Try a different search term or clear the current filter."
            : "Upload a file to get started, or move files into this folder from another location."}
        </p>
      </div>
    </div>
  );
}
