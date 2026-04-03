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
import { Input } from "@/components/ui/input";

type CreateFolderDialogProps = {
  isOpen: boolean;
  isPending?: boolean;
  name: string;
  parentLabel: string;
  onConfirm: () => void;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function CreateFolderDialog({
  isOpen,
  isPending = false,
  name,
  parentLabel,
  onConfirm,
  onNameChange,
  onOpenChange,
}: CreateFolderDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create folder</DialogTitle>
          <DialogDescription>
            Create a new folder inside {parentLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <Input
            aria-label="Folder name"
            autoFocus
            disabled={isPending}
            onChange={(event) => onNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && name.trim() && !isPending) {
                event.preventDefault();
                void onConfirm();
              }
            }}
            placeholder="Folder name"
            value={name}
          />
          <p className="text-sm text-muted-foreground">Parent folder: {parentLabel}</p>
        </div>

        <DialogFooter>
          <Button disabled={isPending} onClick={() => onOpenChange(false)} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={!name.trim() || isPending} onClick={onConfirm} type="button">
            Create folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
