"use client";

import { EllipsisVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FileListItem } from "@/lib/files/types";

type FileActionsMenuProps = {
  file: FileListItem;
  onDelete: (file: FileListItem) => void;
  onMove: (file: FileListItem) => void;
  onRename: (file: FileListItem) => void;
  onShare: (file: FileListItem) => void;
};

export function FileActionsMenu({
  file,
  onDelete,
  onMove,
  onRename,
  onShare,
}: FileActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Open actions for ${file.name}`}
          data-testid={`file-actions-${file.id}`}
          data-test-file-name={file.name}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onShare(file)}>Share</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onRename(file)}>Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMove(file)}>Move</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            window.location.assign(`/api/files/${file.id}/download`);
          }}
        >
          Download
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(file)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
