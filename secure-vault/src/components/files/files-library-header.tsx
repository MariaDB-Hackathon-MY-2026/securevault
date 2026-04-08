"use client";

import { HardDrive } from "lucide-react";

import { CardDescription, CardTitle } from "@/components/ui/card";
import type { SearchMode } from "@/lib/search/types";

type FilesLibraryHeaderProps = {
  currentFolderName: string;
  itemCount: number;
  query: string;
  searchMode: SearchMode;
};

export function FilesLibraryHeader({
  currentFolderName,
  itemCount,
  query,
  searchMode,
}: FilesLibraryHeaderProps) {
  const isFilenameMode = searchMode === "filename";

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <CardTitle>{isFilenameMode ? "Filename search" : "Your files"}</CardTitle>
        <CardDescription className="max-w-3xl">
          {isFilenameMode
            ? "Search every ready filename in your library without changing the current folder view."
            : `Browse folders, then use Filter mode to narrow the currently loaded items in ${currentFolderName}.`}
        </CardDescription>
      </div>
      <div className="self-start rounded-full border border-border/70 px-3 py-2 text-xs text-muted-foreground md:self-center">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <HardDrive className="size-4" />
          {isFilenameMode
            ? `${itemCount} result${itemCount === 1 ? "" : "s"}${query ? ` for "${query}"` : ""}`
            : `${itemCount} item${itemCount === 1 ? "" : "s"} in view`}
        </div>
      </div>
    </div>
  );
}
