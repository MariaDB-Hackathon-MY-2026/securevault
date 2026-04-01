"use client";

import { HardDrive } from "lucide-react";

import { CardDescription, CardTitle } from "@/components/ui/card";

type FilesLibraryHeaderProps = {
  fileCount: number;
};

export function FilesLibraryHeader({ fileCount }: FilesLibraryHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <CardTitle>Your files</CardTitle>
        <CardDescription className="max-w-3xl">
          Browse, rename, move, preview, and delete encrypted files without leaving the page.
        </CardDescription>
      </div>
      <div className="self-start rounded-full border border-border/70 px-3 py-2 text-xs text-muted-foreground md:self-center">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <HardDrive className="size-4" />
          {fileCount} files
        </div>
      </div>
    </div>
  );
}
