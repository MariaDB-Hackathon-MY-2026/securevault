"use client";

import { EllipsisVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderListItem } from "@/lib/files/types";

type FolderActionsMenuProps = {
  folder: FolderListItem;
  onDelete: (folder: FolderListItem) => void;
  onMove: (folder: FolderListItem) => void;
};

export function FolderActionsMenu({
  folder,
  onDelete,
  onMove,
}: FolderActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Open actions for folder ${folder.name}`}
          onClick={(event) => {
            event.stopPropagation();
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onMove(folder)}>Move</DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => onDelete(folder)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
