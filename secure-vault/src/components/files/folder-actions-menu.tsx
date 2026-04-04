"use client";

import * as React from "react";
import { EllipsisVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderListItem } from "@/lib/files/types";

type FolderActionsMenuProps = {
  folder: FolderListItem;
  onDelete: (folder: FolderListItem) => void;
  onMove: (folder: FolderListItem) => void;
  onRename: (folder: FolderListItem) => void;
  onShare: (folder: FolderListItem) => void;
};

export function FolderActionsMenu({
  folder,
  onDelete,
  onMove,
  onRename,
  onShare,
}: FolderActionsMenuProps) {
  const [open, setOpen] = React.useState(false);
  const pendingRenameRef = React.useRef<FolderListItem | null>(null);
  const skipCloseAutoFocusRef = React.useRef(false);

  React.useEffect(() => {
    if (open || !pendingRenameRef.current) {
      return;
    }

    const pendingFolder = pendingRenameRef.current;
    pendingRenameRef.current = null;

    const timeoutId = window.setTimeout(() => {
      onRename(pendingFolder);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onRename, open]);

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Open actions for folder ${folder.name}`}
          data-testid={`folder-actions-${folder.id}`}
          data-test-folder-name={folder.name}
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
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!skipCloseAutoFocusRef.current) {
            return;
          }

          event.preventDefault();
          skipCloseAutoFocusRef.current = false;
        }}
      >
        <DropdownMenuItem onSelect={() => onShare(folder)}>Share</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            skipCloseAutoFocusRef.current = true;
            pendingRenameRef.current = folder;
            setOpen(false);
          }}
        >
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMove(folder)}>Move</DropdownMenuItem>
        <DropdownMenuSeparator />
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
