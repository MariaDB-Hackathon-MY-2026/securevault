"use client";

import { ArrowRight, FolderOpen } from "lucide-react";

import { FileActionsMenu } from "@/components/files/file-actions-menu";
import {
  formatExplorerDate,
  formatFileSize,
} from "@/components/files/file-browser-utils";
import { FileIcon } from "@/components/files/file-icon";
import { DownloadButton } from "@/components/files/download-button";
import { FilePreview } from "@/components/files/file-preview";
import { Input } from "@/components/ui/input";
import { canPreviewMime } from "@/lib/files/preview";
import type { FileListItem, FolderListItem } from "@/lib/files/types";

type FileGridProps = {
  files: FileListItem[];
  folders: FolderListItem[];
  onDelete: (file: FileListItem) => void;
  onFolderOpen: (folderId: string) => void;
  onMove: (file: FileListItem) => void;
  onRenameCancel: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: (file: FileListItem) => void;
  onRenameStart: (file: FileListItem) => void;
  renameDraft: string;
  renamingFileId: string | null;
};

export function FileGrid({
  files,
  folders,
  onDelete,
  onFolderOpen,
  onMove,
  onRenameCancel,
  onRenameChange,
  onRenameCommit,
  onRenameStart,
  renameDraft,
  renamingFileId,
}: FileGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {folders.map((folder) => (
        <button
          key={folder.id}
          className="flex min-h-44 flex-col justify-between rounded-lg border border-border/70 bg-background p-4 text-left transition-colors hover:bg-muted/40"
          onClick={() => onFolderOpen(folder.id)}
          type="button"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
                <FileIcon className="size-6" isFolder />
              </div>
              <div className="rounded-full border border-border/70 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Folder
              </div>
            </div>
            <div className="space-y-1">
              <p className="line-clamp-2 text-base font-medium">{folder.name}</p>
              <p className="text-xs text-muted-foreground">
                Created {formatExplorerDate(folder.createdAt)}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="size-4" />
            Open folder
            <ArrowRight className="size-4" />
          </div>
        </button>
      ))}

      {files.map((file) => (
        <div
          key={file.id}
          className="flex min-h-44 flex-col justify-between rounded-lg border border-border/70 bg-background p-4"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              {canPreviewMime(file.mimeType) ? (
                <FilePreview file={file}>
                  <button
                    className="flex size-12 items-center justify-center rounded-full bg-muted/60 transition-colors hover:bg-muted"
                    type="button"
                  >
                    <FileIcon className="size-6" mimeType={file.mimeType} />
                  </button>
                </FilePreview>
              ) : (
                <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
                  <FileIcon className="size-6" mimeType={file.mimeType} />
                </div>
              )}

              <FileActionsMenu
                file={file}
                onDelete={onDelete}
                onMove={onMove}
                onRename={onRenameStart}
              />
            </div>

            <div className="space-y-2">
              {renamingFileId === file.id ? (
                <Input
                  aria-label={`Rename ${file.name}`}
                  autoFocus
                  className="h-10"
                  onBlur={() => onRenameCommit(file)}
                  onChange={(event) => onRenameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onRenameCommit(file);
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      onRenameCancel();
                    }
                  }}
                  value={renameDraft}
                />
              ) : (
                <button
                  className="line-clamp-2 text-left text-base font-medium transition-colors hover:text-primary"
                  onClick={() => onRenameStart(file)}
                  type="button"
                >
                  {file.name}
                </button>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{formatFileSize(file.size)}</span>
                <span>Modified {formatExplorerDate(file.updatedAt)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <FilePreview file={file} />
            </div>
            <DownloadButton file={file} />
          </div>
        </div>
      ))}
    </div>
  );
}
