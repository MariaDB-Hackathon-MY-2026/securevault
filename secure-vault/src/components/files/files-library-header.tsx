"use client";

import { HardDrive } from "lucide-react";

import { CardDescription, CardTitle } from "@/components/ui/card";

type FilesLibraryHeaderProps = {
  currentFolderName: string;
  itemCount: number;
  query: string;
  searchMode: "filename" | "semantic";
};

export function FilesLibraryHeader({
  currentFolderName,
  itemCount,
  query,
  searchMode,
}: FilesLibraryHeaderProps) {
  const normalizedQuery = query.trim();
  const isSearchActive = normalizedQuery.length > 0;
  const description = isSearchActive
    ? searchMode === "semantic"
      ? "Describe what you're looking for to search semantically across indexed PDFs and images."
      : "Search every ready filename in your library, then open the matching folder when you want to keep browsing."
    : `Browse folders in ${currentFolderName}, or search semantically across your whole library.`;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <CardTitle>{isSearchActive ? "Search your files" : "Your files"}</CardTitle>
        <CardDescription className="max-w-3xl">
          {description}
        </CardDescription>
      </div>
      <div className="self-start rounded-full border border-border/70 px-3 py-2 text-xs text-muted-foreground md:self-center">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <HardDrive className="size-4" />
          {isSearchActive
            ? `${itemCount} result${itemCount === 1 ? "" : "s"}${normalizedQuery ? ` for "${normalizedQuery}"` : ""}`
            : `${itemCount} item${itemCount === 1 ? "" : "s"} in view`}
        </div>
      </div>
    </div>
  );
}
