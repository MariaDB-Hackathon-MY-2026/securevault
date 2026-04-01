"use client";

import { FolderPlus, Grid2x2, List, LoaderCircle, Search } from "lucide-react";

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
  selectedCount,
  sort,
  viewMode,
}: ToolbarProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border/70 bg-background/80 p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filter files by name"
              className="min-h-11 pl-9"
              onChange={(event) => onFilterValueChange(event.target.value)}
              placeholder="Quick filter by name"
              value={filterValue}
            />
          </label>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="min-h-11 justify-between sm:min-w-44"
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden border border-border">
            <Button
              aria-pressed={viewMode === "grid"}
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
              onClick={() => onViewModeChange("list")}
              size="lg"
              type="button"
              variant={viewMode === "list" ? "default" : "ghost"}
            >
              <List className="size-4" />
              List
            </Button>
          </div>

          <Button
            disabled={!onNewFolderClick}
            onClick={onNewFolderClick}
            size="lg"
            type="button"
            variant="outline"
          >
            <FolderPlus className="size-4" />
            New folder
          </Button>

          {canUpload ? (
            <UploadDialog>
              <Button size="lg" type="button">
                Upload files
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
              Refreshing file list
            </>
          ) : (
            "Browsing your encrypted files"
          )}
        </div>

        {selectedCount > 0 ? (
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
