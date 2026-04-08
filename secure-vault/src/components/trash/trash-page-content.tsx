"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  emptyTrashAction,
  permanentlyDeleteFileAction,
  permanentlyDeleteFolderAction,
  restoreFileAction,
  restoreFolderAction,
} from "@/app/(dashboard)/trash/actions";
import { TrashItemCard } from "@/components/trash/trash-item-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrashQuery } from "@/hooks/use-trash-query";
import { filesExplorerQueryKey } from "@/lib/files/files-explorer-query";
import { storageDashboardQueryKey } from "@/lib/files/storage-dashboard-query";
import { trashQueryKey, trashSummaryQueryKey } from "@/lib/trash/trash-query";
import type { TrashItem, TrashPageData } from "@/lib/trash/types";
import { currentUserQueryKey } from "@/lib/auth/current-user-client";

type TrashPageContentProps = {
  initialData: TrashPageData;
};

type ConfirmState =
  | { item: TrashItem; type: "delete-item" }
  | { type: "empty-trash" }
  | null;

function createEmptyTrashData(): TrashPageData {
  return {
    items: [],
    summary: {
      rootFileCount: 0,
      rootFolderCount: 0,
      totalRootItemCount: 0,
    },
  };
}

function removeTrashItem(data: TrashPageData, itemId: string): TrashPageData {
  const items = data.items.filter((item) => item.id !== itemId);

  return {
    items,
    summary: {
      rootFileCount: items.filter((item) => item.kind === "file").length,
      rootFolderCount: items.filter((item) => item.kind === "folder").length,
      totalRootItemCount: items.length,
    },
  };
}

export function TrashPageContent({ initialData }: TrashPageContentProps) {
  const queryClient = useQueryClient();
  const { data = initialData, isFetching } = useTrashQuery(initialData);
  const [confirmState, setConfirmState] = React.useState<ConfirmState>(null);
  const [pendingRestoreId, setPendingRestoreId] = React.useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [isEmptyPending, setIsEmptyPending] = React.useState(false);

  const items = data.items;

  function getTrashDataFromCache() {
    return queryClient.getQueryData<TrashPageData>(trashQueryKey) ?? data;
  }

  function setTrashDataInCache(nextData: TrashPageData) {
    queryClient.setQueryData(trashQueryKey, nextData);
    queryClient.setQueryData(trashSummaryQueryKey, nextData.summary);
  }

  async function invalidateRelatedQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trashQueryKey }),
      queryClient.invalidateQueries({ queryKey: trashSummaryQueryKey }),
      queryClient.invalidateQueries({ queryKey: filesExplorerQueryKey }),
      queryClient.invalidateQueries({ queryKey: storageDashboardQueryKey }),
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey }),
    ]);
  }

  async function handleRestore(item: TrashItem) {
    if (pendingRestoreId === item.id || pendingDeleteId === item.id || isEmptyPending) {
      return;
    }

    const previousData = getTrashDataFromCache();
    setPendingRestoreId(item.id);
    setTrashDataInCache(removeTrashItem(previousData, item.id));

    try {
      if (item.kind === "folder") {
        await restoreFolderAction(item.id);
        toast.success("Folder restored");
      } else {
        await restoreFileAction(item.id);
        toast.success("File restored");
      }
    } catch (error) {
      setTrashDataInCache(previousData);
      toast.error(error instanceof Error ? error.message : "Failed to restore item");
    } finally {
      setPendingRestoreId(null);
      await invalidateRelatedQueries();
    }
  }

  async function handlePermanentDelete(item: TrashItem) {
    if (pendingDeleteId === item.id || pendingRestoreId === item.id || isEmptyPending) {
      return;
    }

    const previousData = getTrashDataFromCache();
    setConfirmState(null);
    setPendingDeleteId(item.id);
    setTrashDataInCache(removeTrashItem(previousData, item.id));

    try {
      if (item.kind === "folder") {
        await permanentlyDeleteFolderAction(item.id);
        toast.success("Folder permanently deleted");
      } else {
        await permanentlyDeleteFileAction(item.id);
        toast.success("File permanently deleted");
      }
    } catch (error) {
      setTrashDataInCache(previousData);
      toast.error(error instanceof Error ? error.message : "Failed to permanently delete item");
    } finally {
      setPendingDeleteId(null);
      await invalidateRelatedQueries();
    }
  }

  async function handleEmptyTrash() {
    if (isEmptyPending || items.length === 0) {
      return;
    }

    const previousData = getTrashDataFromCache();
    setConfirmState(null);
    setIsEmptyPending(true);
    setTrashDataInCache(createEmptyTrashData());

    try {
      await emptyTrashAction();
      toast.success("Trash emptied");
    } catch (error) {
      setTrashDataInCache(previousData);
      toast.error(error instanceof Error ? error.message : "Failed to empty trash");
    } finally {
      setIsEmptyPending(false);
      await invalidateRelatedQueries();
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Trash</p>
          <h2 className="mt-2 text-3xl font-semibold">Deleted items</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Restore items before the retention window ends, or permanently delete them to reclaim storage quota.
          </p>
        </div>

        <Button
          data-testid="empty-trash-button"
          disabled={items.length === 0 || isEmptyPending}
          onClick={() => setConfirmState({ type: "empty-trash" })}
          variant="destructive"
        >
          {isEmptyPending ? "Emptying..." : "Empty Trash"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Storage note</CardTitle>
          <CardDescription>
            Soft-deleted items stay encrypted and still count toward your quota until you permanently delete them.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{items.length === 0 ? "Trash is empty" : `${items.length} root items in trash`}</span>
        <span>{isFetching ? "Refreshing..." : "Up to date"}</span>
      </div>

      {items.length === 0 ? (
        <Card data-testid="trash-empty-state">
          <CardHeader>
            <CardTitle>Nothing in trash</CardTitle>
            <CardDescription>
              Deleted files and folders will appear here until they are restored or permanently deleted.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => {
            const isRestorePending = pendingRestoreId === item.id;
            const isDeletePending = pendingDeleteId === item.id;
            const isPending = isRestorePending || isDeletePending || isEmptyPending;

            return (
              <TrashItemCard
                isDeletePending={isDeletePending}
                isPending={isPending}
                isRestorePending={isRestorePending}
                item={item}
                key={`${item.kind}-${item.id}`}
                onDelete={(selectedItem) => setConfirmState({ item: selectedItem, type: "delete-item" })}
                onRestore={handleRestore}
              />
            );
          })}
        </div>
      )}

      <AlertDialog open={confirmState !== null} onOpenChange={(open) => !open && setConfirmState(null)}>
        <AlertDialogContent data-testid="trash-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmState?.type === "empty-trash" ? "Empty trash?" : "Delete permanently?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmState?.type === "empty-trash"
                ? "This permanently deletes every root item in trash and reclaims storage for ready files. This action cannot be undone."
                : `Permanently delete "${confirmState?.item.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="trash-confirm-cancel"
              disabled={isEmptyPending || pendingDeleteId !== null}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="trash-confirm-submit"
              disabled={isEmptyPending || pendingDeleteId !== null}
              onClick={(event) => {
                event.preventDefault();

                if (confirmState?.type === "empty-trash") {
                  void handleEmptyTrash();
                  return;
                }

                if (confirmState?.type === "delete-item") {
                  void handlePermanentDelete(confirmState.item);
                }
              }}
            >
              {confirmState?.type === "empty-trash" ? "Empty Trash" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
