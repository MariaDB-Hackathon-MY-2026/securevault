"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FolderListItem } from "@/lib/files/types";

type FilesBreadcrumbsProps = {
  currentFolderPath: FolderListItem[];
  isFetching: boolean;
  onNavigate: (folderId: string | null) => void;
};

export function FilesBreadcrumbs({
  currentFolderPath,
  isFetching,
  onNavigate,
}: FilesBreadcrumbsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Button
        className="h-auto px-0 text-sm"
        onClick={() => onNavigate(null)}
        type="button"
        variant="link"
      >
        All files
      </Button>
      {currentFolderPath.map((folder) => (
        <React.Fragment key={folder.id}>
          <span>/</span>
          <Button
            className="h-auto px-0 text-sm"
            onClick={() => onNavigate(folder.id)}
            type="button"
            variant="link"
          >
            {folder.name}
          </Button>
        </React.Fragment>
      ))}
      {isFetching ? (
        <span className="ml-auto inline-flex items-center gap-2">
          <RefreshCcw className="size-4 animate-spin" />
          Refreshing
        </span>
      ) : null}
    </div>
  );
}
