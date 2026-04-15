"use client";

import * as React from "react";
import { ArrowUpDown } from "lucide-react";

import { FileActionsMenu } from "@/components/files/file-actions-menu";
import { FolderActionsMenu } from "@/components/files/folder-actions-menu";
import {
  type FileSortKey,
  type FileSortState,
  formatExplorerDate,
  formatFileSize,
} from "@/components/files/file-browser-utils";
import { FileIcon } from "@/components/files/file-icon";
import { FilePreview } from "@/components/files/file-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FileListItem, FolderListItem } from "@/lib/files/types";

type FileListProps = {
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
  onSortChange: (sort: FileSortState) => void;
  onToggleAllFiles: (checked: boolean) => void;
  onToggleFileSelection: (fileId: string) => void;
  renameDraft: string;
  renamingFileId: string | null;
  renamingFolderId: string | null;
  selectedFileIds: string[];
  semanticSearchEnabled: boolean;
  sort: FileSortState;
};

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      aria-label="Select all visible files"
      checked={checked}
      className="size-4"
      onChange={(event) => onChange(event.target.checked)}
      ref={ref}
      type="checkbox"
    />
  );
}

export function FileList({
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
  onSortChange,
  onToggleAllFiles,
  onToggleFileSelection,
  renameDraft,
  renamingFileId,
  renamingFolderId,
  selectedFileIds,
  semanticSearchEnabled,
  sort,
}: FileListProps) {
  const selectedFileIdSet = React.useMemo(() => new Set(selectedFileIds), [selectedFileIds]);
  const visibleFileIds = files.map((file) => file.id);
  const selectedVisibleCount = visibleFileIds.filter((fileId) =>
    selectedFileIdSet.has(fileId),
  ).length;
  const allVisibleSelected =
    visibleFileIds.length > 0 && selectedVisibleCount === visibleFileIds.length;

  function toggleSort(nextKey: FileSortKey) {
    onSortChange({
      key: nextKey,
      direction:
        sort.key === nextKey && sort.direction === "asc"
          ? "desc"
          : "asc",
    });
  }

  function renderSortButton(label: string, key: FileSortKey) {
    return (
      <Button
        className="h-auto px-0 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:bg-transparent"
        onClick={() => toggleSort(key)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {label}
        <ArrowUpDown className="size-3.5" />
      </Button>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="border-b border-border/70">
            <th className="w-12 px-4 py-3 text-left">
              <SelectAllCheckbox
                checked={allVisibleSelected}
                indeterminate={selectedVisibleCount > 0 && !allVisibleSelected}
                onChange={onToggleAllFiles}
              />
            </th>
            <th
              aria-sort={sort.key === "name" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
              className="px-4 py-3 text-left"
            >
              {renderSortButton("Name", "name")}
            </th>
            <th
              aria-sort={sort.key === "size" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
              className="px-4 py-3 text-left"
            >
              {renderSortButton("Size", "size")}
            </th>
            <th
              aria-sort={sort.key === "updatedAt" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
              className="px-4 py-3 text-left"
            >
              {renderSortButton("Modified", "updatedAt")}
            </th>
            <th className="w-40 px-4 py-3 text-right text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <tr
              key={folder.id}
              className="border-b border-border/60 last:border-b-0 hover:bg-muted/20"
              data-testid={`folder-row-${folder.id}`}
              data-test-folder-name={folder.name}
            >
              <td className="px-4 py-4" />
              <td className="px-4 py-4">
                <div className="flex min-h-11 items-center gap-3">
                  <FileIcon isFolder />
                  {renamingFolderId === folder.id ? (
                    <Input
                      aria-label="Rename folder"
                      autoFocus
                      className="h-10 max-w-md"
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
                      className="truncate text-left font-medium transition-colors hover:text-primary"
                      data-testid={`folder-name-${folder.id}`}
                      data-test-folder-name={folder.name}
                      onClick={() => onFolderOpen(folder.id)}
                      type="button"
                    >
                      {folder.name}
                    </button>
                  )}
                </div>
              </td>
              <td className="px-4 py-4 text-muted-foreground">Folder</td>
              <td className="px-4 py-4 text-muted-foreground">
                {formatExplorerDate(folder.createdAt)}
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    data-testid={`folder-open-${folder.id}`}
                    data-test-folder-name={folder.name}
                    onClick={() => onFolderOpen(folder.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Open
                  </Button>
                  <FolderActionsMenu
                    folder={folder}
                    onDelete={onFolderDelete}
                    onMove={onFolderMove}
                    onRename={onFolderRenameStart}
                  onShare={onFolderShare}
                />
                </div>
              </td>
            </tr>
          ))}

          {files.map((file) => {
            const isSelected = selectedFileIdSet.has(file.id);

            return (
              <tr
                key={file.id}
                className="border-b border-border/60 last:border-b-0 hover:bg-muted/20"
                data-testid={`file-row-${file.id}`}
                data-test-file-name={file.name}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    onToggleFileSelection(file.id);
                  }
                }}
              >
                <td className="px-4 py-4">
                  <input
                    aria-label={`Select ${file.name}`}
                    checked={isSelected}
                    className="size-4"
                    onChange={() => onToggleFileSelection(file.id)}
                    type="checkbox"
                  />
                </td>
                <td className="px-4 py-4">
                  <div className="flex min-h-11 items-center gap-3">
                    <FileIcon mimeType={file.mimeType} />
                    {renamingFileId === file.id ? (
                      <Input
                        aria-label="Rename file"
                        autoFocus
                        className="h-10 max-w-md"
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
                        className="truncate text-left font-medium transition-colors hover:text-primary"
                        data-testid={`file-name-${file.id}`}
                        data-test-file-name={file.name}
                        onClick={() => onRenameStart(file)}
                        type="button"
                      >
                        {file.name}
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-muted-foreground">{formatFileSize(file.size)}</td>
                <td className="px-4 py-4 text-muted-foreground">
                  {formatExplorerDate(file.updatedAt)}
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <FilePreview file={file} />
                    <FileActionsMenu
                      file={file}
                      onDelete={onDelete}
                      onMove={onMove}
                      onRename={onRenameStart}
                      onShare={onShare}
                      semanticSearchEnabled={semanticSearchEnabled}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
