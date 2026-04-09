"use client";

import { ArrowRight, FolderOpen } from "lucide-react";

import { FileActionsMenu } from "@/components/files/file-actions-menu";
import { FolderActionsMenu } from "@/components/files/folder-actions-menu";
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
  onShare: (file: FileListItem) => void;
  onFolderDelete: (folder: FolderListItem) => void;
  onFolderShare: (folder: FolderListItem) => void;
  onFolderMove: (folder: FolderListItem) => void;
  onFolderOpen: (folderId: string) => void;
  onFolderRenameCancel: () => void;
  onFolderRenameChange: (value: string) => void;
  onFolderRenameCommit: (folder: FolderListItem) => void;
  onFolderRenameStart: (folder: FolderListItem) => void;
  onMove: (file: FileListItem) => void;
  onRenameCancel: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: (file: FileListItem) => void;
  onRenameStart: (file: FileListItem) => void;
  renamingFolderId: string | null;
  renameDraft: string;
  renamingFileId: string | null;
};

export function FileGrid({
  files,
  folders,
  onDelete,
  onShare,
  onFolderDelete,
  onFolderShare,
  onFolderMove,
  onFolderOpen,
  onFolderRenameCancel,
  onFolderRenameChange,
  onFolderRenameCommit,
  onFolderRenameStart,
  onMove,
  onRenameCancel,
  onRenameChange,
  onRenameCommit,
  onRenameStart,
  renamingFolderId,
  renameDraft,
  renamingFileId,
}: FileGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {folders.map((folder) => (
        <div
          key={folder.id}
          className="flex min-h-44 flex-col justify-between rounded-lg border border-border/70 bg-background p-4"
          data-testid={`folder-card-${folder.id}`}
          data-test-folder-name={folder.name}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10">
                <FileIcon className="size-6" isFolder />
              </div>
              <div className="flex items-start gap-2">
                <div className="rounded-full border border-border/70 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Folder
                </div>
                <FolderActionsMenu
                  folder={folder}
                  onDelete={onFolderDelete}
                  onMove={onFolderMove}
                  onRename={onFolderRenameStart}
                  onShare={onFolderShare}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-1 flex-col justify-between">
            <div className="space-y-1">
              {renamingFolderId === folder.id ? (
                <Input
                  aria-label="Rename folder"
                  autoFocus
                  className="h-10"
                  data-testid={`rename-folder-${folder.id}`}
                  data-test-folder-name={folder.name}
                  onBlur={() => onFolderRenameCommit(folder)}
                  onChange={(event) => onFolderRenameChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onFolderRenameCommit(folder);
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      onFolderRenameCancel();
                    }
                  }}
                  value={renameDraft}
                />
              ) : (
                <button
                  className="line-clamp-2 text-left text-base font-medium transition-colors hover:text-primary"
                  data-testid={`folder-name-${folder.id}`}
                  data-test-folder-name={folder.name}
                  onClick={() => onFolderOpen(folder.id)}
                  type="button"
                >
                  {folder.name}
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                Created {formatExplorerDate(folder.createdAt)}
              </p>
            </div>
            <button
              className="mt-4 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
              data-testid={`folder-open-${folder.id}`}
              data-test-folder-name={folder.name}
              onClick={() => onFolderOpen(folder.id)}
              type="button"
            >
              <FolderOpen className="size-4" />
              Open folder
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      ))}

      {files.map((file) => (
        <div
          key={file.id}
          className="flex min-h-44 flex-col justify-between rounded-lg border border-border/70 bg-background p-4"
          data-testid={`file-card-${file.id}`}
          data-test-file-name={file.name}
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
                  onShare={onShare}
                />
            </div>

            <div className="space-y-2">
              {renamingFileId === file.id ? (
                <Input
                  aria-label="Rename file"
                  autoFocus
                  className="h-10"
                  data-testid={`rename-file-${file.id}`}
                  data-test-file-name={file.name}
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
                  data-testid={`file-name-${file.id}`}
                  data-test-file-name={file.name}
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

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="flex min-h-10 items-center">
              <FilePreview file={file} />
            </div>
            <div className="flex min-h-10 items-center">
              <DownloadButton file={file} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
