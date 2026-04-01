"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getFolderDepth } from "@/components/files/file-browser-utils";
import type { FolderListItem } from "@/lib/files/types";

type MoveFilesDialogProps = {
  folderMap: Map<string, FolderListItem>;
  folders: FolderListItem[];
  isOpen: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onTargetFolderChange: (folderId: string | null) => void;
  selectedFolderId: string | null;
  title: string;
};

export function MoveFilesDialog({
  folderMap,
  folders,
  isOpen,
  isPending,
  onConfirm,
  onOpenChange,
  onTargetFolderChange,
  selectedFolderId,
  title,
}: MoveFilesDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="gap-5 p-6 sm:max-w-xl">
        <DialogHeader className="space-y-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a destination folder. Selecting All files moves the chosen files back to the root.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 pt-2">
          <Button
            className="w-full justify-start"
            onClick={() => onTargetFolderChange(null)}
            type="button"
            variant={selectedFolderId === null ? "default" : "outline"}
          >
            All files (root)
          </Button>

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {folders.map((folder) => (
              <Button
                key={folder.id}
                className="w-full justify-start"
                onClick={() => onTargetFolderChange(folder.id)}
                style={{ paddingLeft: `${getFolderDepth(folder.id, folderMap) * 16 + 12}px` }}
                type="button"
                variant={selectedFolderId === folder.id ? "default" : "outline"}
              >
                {folder.name}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter className="pt-2 sm:pt-4">
          <Button disabled={isPending} onClick={() => onOpenChange(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={isPending} onClick={onConfirm} type="button">
            Move files
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
