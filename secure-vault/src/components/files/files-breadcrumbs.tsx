"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";

import { FolderActionsMenu } from "@/components/files/folder-actions-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FolderListItem } from "@/lib/files/types";

type FilesBreadcrumbsProps = {
  currentFolderPath: FolderListItem[];
  currentFolder?: FolderListItem | null;
  currentFolderActions?:
    | {
        onDelete: (folder: FolderListItem) => void;
        onMove: (folder: FolderListItem) => void;
        onRename: (folder: FolderListItem) => void;
      }
    | undefined;
  isFetching: boolean;
  onNavigate: (folderId: string | null) => void;
  onRenameCancel: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: (folder: FolderListItem) => void;
  renameDraft: string;
  renamingFolderId: string | null;
};

export function FilesBreadcrumbs({
  currentFolderPath,
  currentFolder = null,
  currentFolderActions,
  isFetching,
  onNavigate,
  onRenameCancel,
  onRenameChange,
  onRenameCommit,
  renameDraft,
  renamingFolderId,
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
            {currentFolder?.id === folder.id && renamingFolderId === folder.id ? (
              <Input
                aria-label="Rename folder"
                autoFocus
                className="h-9 w-48"
                onBlur={() => onRenameCommit(folder)}
                onChange={(event) => onRenameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onRenameCommit(folder);
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    onRenameCancel();
                  }
                }}
                value={renameDraft}
              />
            ) : (
              <Button
                className="h-auto px-0 text-sm"
                onClick={() => onNavigate(folder.id)}
                type="button"
                variant="link"
              >
                {folder.name}
              </Button>
            )}
            {currentFolder?.id === folder.id && currentFolderActions ? (
              <FolderActionsMenu
                folder={folder}
                onDelete={currentFolderActions.onDelete}
                onMove={currentFolderActions.onMove}
                onRename={currentFolderActions.onRename}
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
