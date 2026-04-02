"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";

import { FolderActionsMenu } from "@/components/files/folder-actions-menu";
import { Button } from "@/components/ui/button";
import type { FolderListItem } from "@/lib/files/types";

type FilesBreadcrumbsProps = {
  currentFolderPath: FolderListItem[];
  currentFolder?: FolderListItem | null;
  isFetching: boolean;
  onCurrentFolderDelete?: (folder: FolderListItem) => void;
  onCurrentFolderMove?: (folder: FolderListItem) => void;
  onNavigate: (folderId: string | null) => void;
};

export function FilesBreadcrumbs({
  currentFolderPath,
  currentFolder = null,
  isFetching,
  onCurrentFolderDelete,
  onCurrentFolderMove,
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
          <div className="flex items-center gap-1">
            <Button
              className="h-auto px-0 text-sm"
              onClick={() => onNavigate(folder.id)}
              type="button"
              variant="link"
            >
              {folder.name}
            </Button>
            {currentFolder?.id === folder.id && onCurrentFolderDelete && onCurrentFolderMove ? (
              <FolderActionsMenu
                folder={folder}
                onDelete={onCurrentFolderDelete}
                onMove={onCurrentFolderMove}
              />
            ) : null}
          </div>
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
