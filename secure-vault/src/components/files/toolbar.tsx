"use client";

import { FolderPlus, Grid2x2, List, LoaderCircle, Search, UploadCloud } from "lucide-react";

import {
  type FileSortState,
  type FilesViewMode,
  getSortLabel,
} from "@/components/files/file-browser-utils";
import { UploadDialog } from "@/components/upload/upload-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SearchMode } from "@/lib/search/types";

type ToolbarProps = {
  canUpload: boolean;
  filterValue: string;
  isFetching: boolean;
  onBulkDelete: () => void;
  onBulkMove: () => void;
  onClearSelection: () => void;
  onFilterValueChange: (value: string) => void;
  onNewFolderClick?: () => void;
  onSortChange: (sort: FileSortState) => void;
  onViewModeChange: (viewMode: FilesViewMode) => void;
  searchMode: SearchMode;
  searchQuery: string;
  semanticSearchEnabled: boolean;
  selectedCount: number;
  sort: FileSortState;
  viewMode: FilesViewMode;
};

const sortOptions: FileSortState[] = [
  { key: "updatedAt", direction: "desc" },
  { key: "updatedAt", direction: "asc" },
  { key: "name", direction: "asc" },
  { key: "name", direction: "desc" },
  { key: "size", direction: "desc" },
  { key: "size", direction: "asc" },
];

export function Toolbar({
  canUpload,
  filterValue,
  isFetching,
  onBulkDelete,
  onBulkMove,
  onClearSelection,
  onFilterValueChange,
  onNewFolderClick,
  onSortChange,
  onViewModeChange,
  searchMode,
  searchQuery,
  semanticSearchEnabled,
  selectedCount,
  sort,
  viewMode,
}: ToolbarProps) {
  const isSearchActive = searchQuery.trim().length > 0;
  const helperCopy = searchMode === "semantic"
    ? semanticSearchEnabled
      ? isSearchActive
        ? "Semantic search finds related PDFs and images by meaning, not exact words."
        : "Browse folders normally, or search semantically across indexed PDFs and images."
      : "Semantic search is disabled for this deployment."
    : isSearchActive
      ? "Filename search looks across ready file names in your whole library."
      : "Browse folders normally. This search bar is currently set to exact filename matching.";
  const searchLabel = searchMode === "semantic" ? "Search semantically" : "Search filenames";
  const placeholder = searchMode === "semantic" ? "Describe the file you need" : "Search exact filenames";

  return (
    <div
      className="space-y-4 rounded-lg border border-border/70 bg-background/80 p-4"
      data-testid="files-library-toolbar"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:min-w-56 lg:min-w-64">
            <span className="sr-only">{searchLabel}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="min-h-11 pl-9"
              data-testid="files-library-toolbar-search-input"
              onChange={(event) => onFilterValueChange(event.target.value)}
              placeholder={placeholder}
              value={filterValue}
            />
          </label>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="min-h-11 shrink-0 justify-between sm:min-w-44"
                type="button"
                variant="outline"
              >
                <span>Sort: {getSortLabel(sort)}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {sortOptions.map((option) => (
                <DropdownMenuItem
                  key={`${option.key}-${option.direction}`}
                  onSelect={() => onSortChange(option)}
                >
                  {getSortLabel(option)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-nowrap lg:self-start">
          {!isSearchActive ? (
            <div className="flex shrink-0 overflow-hidden border border-border">
              <Button
                aria-pressed={viewMode === "grid"}
                className={viewMode === "grid" ? "min-h-11 text-foreground" : "min-h-11"}
                onClick={() => onViewModeChange("grid")}
                size="lg"
                type="button"
                variant={viewMode === "grid" ? "default" : "ghost"}
              >
                <Grid2x2 className="size-4" />
                Grid
              </Button>
              <Button
                aria-pressed={viewMode === "list"}
                className={viewMode === "list" ? "min-h-11 text-foreground" : "min-h-11"}
                onClick={() => onViewModeChange("list")}
                size="lg"
                type="button"
                variant={viewMode === "list" ? "default" : "ghost"}
              >
                <List className="size-4" />
                List
              </Button>
            </div>
          ) : null}

          <Button
            className="min-h-11 min-w-11 shrink-0 px-0"
            data-testid="files-new-folder-trigger"
            disabled={!onNewFolderClick || isSearchActive}
            onClick={onNewFolderClick}
            size="lg"
            title="New folder"
            type="button"
            variant="outline"
          >
            <FolderPlus className="size-4" />
            <span className="sr-only">New folder</span>
          </Button>

          {canUpload ? (
            <UploadDialog>
              <Button
                className="min-h-11 min-w-11 shrink-0 px-0 text-foreground"
                data-testid="files-library-toolbar-upload-trigger"
                size="lg"
                title="Upload files"
                type="button"
              >
                <UploadCloud className="size-4" />
                <span className="sr-only">Upload files</span>
              </Button>
            </UploadDialog>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex min-h-6 items-center gap-2">
          {isFetching ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              {searchMode === "semantic"
                ? "Searching semantically"
                : "Searching filenames"}
            </>
          ) : (
            helperCopy
          )}
        </div>

        {!isSearchActive && selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span>{selectedCount} selected</span>
            <Button onClick={onBulkMove} size="sm" type="button" variant="outline">
              Move
            </Button>
            <Button onClick={onBulkDelete} size="sm" type="button" variant="destructive">
              Delete
            </Button>
            <Button onClick={onClearSelection} size="sm" type="button" variant="ghost">
              Clear
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
