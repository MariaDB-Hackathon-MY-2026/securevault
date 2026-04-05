"use client";

import { formatExplorerDate, formatFileSize } from "@/components/files/file-browser-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TrashItem } from "@/lib/trash/types";

type TrashItemCardProps = {
  isDeletePending: boolean;
  isPending: boolean;
  isRestorePending: boolean;
  item: TrashItem;
  onDelete: (item: TrashItem) => void;
  onRestore: (item: TrashItem) => void;
};

function formatRemainingDays(purgeAt: string) {
  const remainingMs = new Date(purgeAt).getTime() - Date.now();
  const remainingDays = Math.max(Math.ceil(remainingMs / (24 * 60 * 60 * 1000)), 0);

  if (remainingDays === 1) {
    return "1 day remaining";
  }

  return `${remainingDays} days remaining`;
}

function formatCount(count: number, singularLabel: string, pluralLabel = `${singularLabel}s`) {
  return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}

function TrashItemDetails({ item }: { item: TrashItem }) {
  if (item.kind === "file") {
    return (
      <>
        <p className="text-sm text-muted-foreground">{item.mimeType}</p>
        <p className="text-sm text-muted-foreground">Size: {formatFileSize(item.size)}</p>
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {formatCount(item.descendantFileCount, "file")} and{" "}
        {formatCount(item.descendantFolderCount, "folder")} in this deleted subtree
      </p>
      <p className="text-sm text-muted-foreground">Total size: {formatFileSize(item.totalBytes)}</p>
    </>
  );
}

export function TrashItemCard({
  isDeletePending,
  isPending,
  isRestorePending,
  item,
  onDelete,
  onRestore,
}: TrashItemCardProps) {
  return (
    <Card
      data-testid={`trash-item-${item.kind}-${item.id}`}
      data-test-trash-kind={item.kind}
      data-test-trash-name={item.name}
    >
      <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{item.kind === "folder" ? "Folder" : "File"}</Badge>
            <h3
              className="text-lg font-semibold break-all"
              data-testid={`trash-item-name-${item.kind}-${item.id}`}
            >
              {item.name}
            </h3>
          </div>

          <TrashItemDetails item={item} />

          <div className="text-sm text-muted-foreground">
            <p>Deleted: {formatExplorerDate(item.deletedAt)}</p>
            <p>Purge date: {formatExplorerDate(item.purgeAt)}</p>
            <p>{formatRemainingDays(item.purgeAt)}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Button
            data-testid={`trash-restore-${item.kind}-${item.id}`}
            disabled={isPending}
            onClick={() => void onRestore(item)}
            variant="outline"
          >
            {isRestorePending ? "Restoring..." : "Restore"}
          </Button>
          <Button
            data-testid={`trash-delete-${item.kind}-${item.id}`}
            disabled={isPending}
            onClick={() => onDelete(item)}
            variant="destructive"
          >
            {isDeletePending ? "Deleting..." : "Delete permanently"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
