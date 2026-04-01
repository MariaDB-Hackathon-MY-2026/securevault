"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderTree, HardDrive, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import {
  bulkDeleteAction,
  bulkMoveAction,
  createFolderAction,
  deleteFileAction,
  moveFileAction,
  renameFileAction,
} from "@/app/(dashboard)/files/actions";
import {
  compareFiles,
  compareFolders,
  type FileSortState,
  type FilesViewMode,
  getFolderDepth,
  getFolderPath,
  matchesExplorerFilter,
} from "@/components/files/file-browser-utils";
import { FileGrid } from "@/components/files/file-grid";
import { FileList } from "@/components/files/file-list";
import { Toolbar } from "@/components/files/toolbar";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFilesQuery } from "@/hooks/use-files-query";
import { sanitizeFilename } from "@/lib/crypto/sanitize";
import { filesQueryKey } from "@/lib/files/files-query";
import type { FileListItem, FolderListItem } from "@/lib/files/types";

type FilesLibraryProps = {
  canUpload: boolean;
  initialFiles: FileListItem[];
  initialFolders: FolderListItem[];
};

const defaultSort: FileSortState = {
  direction: "desc",
  key: "updatedAt",
};

export function FilesLibrary({
  canUpload,
  initialFiles,
  initialFolders,
}: FilesLibraryProps) {
  const queryClient = useQueryClient();
  const { data: files = initialFiles, isFetching } = useFilesQuery(initialFiles);
  const [viewMode, setViewMode] = React.useState<FilesViewMode>("grid");
  const [sort, setSort] = React.useState<FileSortState>(defaultSort);
  const [filterValue, setFilterValue] = React.useState("");
  const deferredFilterValue = React.useDeferredValue(filterValue);
  const [folders, setFolders] = React.useState(initialFolders);
  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = React.useState<string[]>([]);
  const [renamingFileId, setRenamingFileId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [createFolderName, setCreateFolderName] = React.useState("");
  const [createFolderParentId, setCreateFolderParentId] = React.useState<string | null>(null);
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] = React.useState(false);
  const [moveDialogFileIds, setMoveDialogFileIds] = React.useState<string[]>([]);
  const [deleteDialogFileIds, setDeleteDialogFileIds] = React.useState<string[]>([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = React.useState<string | null>(null);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  React.useEffect(() => {
    setSelectedFileIds((currentSelection) =>
      currentSelection.filter((fileId) => files.some((file) => file.id === fileId)),
    );
  }, [files]);

  React.useEffect(() => {
    if (renamingFileId && !files.some((file) => file.id === renamingFileId)) {
      setRenamingFileId(null);
      setRenameDraft("");
    }
  }, [files, renamingFileId]);

  const filteredFolders = folders.filter(
    (folder) =>
      folder.parentId === currentFolderId &&
      matchesExplorerFilter(folder.name, deferredFilterValue),
  );
  const filteredFiles = files.filter(
    (file) =>
      file.folderId === currentFolderId &&
      matchesExplorerFilter(file.name, deferredFilterValue),
  );
  const visibleFolders = [...filteredFolders].sort((left, right) =>
    compareFolders(left, right, sort),
  );
  const visibleFiles = [...filteredFiles].sort((left, right) => compareFiles(left, right, sort));
  const currentFolderPath = getFolderPath(currentFolderId, folderMap);
  const selectedCount = selectedFileIds.length;
  const moveDialogTitle =
    moveDialogFileIds.length > 1 ? `Move ${moveDialogFileIds.length} files` : "Move file";
  const deleteDialogTitle =
    deleteDialogFileIds.length > 1 ? `Delete ${deleteDialogFileIds.length} files` : "Delete file";
  const createFolderParentLabel = createFolderParentId
    ? folderMap.get(createFolderParentId)?.name ?? "Selected folder"
    : "All files";

  async function invalidateFiles() {
    await queryClient.invalidateQueries({ queryKey: filesQueryKey });
  }

  function updateFilesInCache(
    updater: (currentFiles: FileListItem[]) => FileListItem[],
  ) {
    queryClient.setQueryData<FileListItem[]>(filesQueryKey, (currentFiles = []) =>
      updater(currentFiles),
    );
  }

  function clearSelection() {
    setSelectedFileIds([]);
  }

  function openMoveDialog(fileIds: string[], targetFolderId: string | null) {
    setMoveDialogFileIds(fileIds);
    setMoveTargetFolderId(targetFolderId);
    setIsMoveDialogOpen(true);
  }

  function openDeleteDialog(fileIds: string[]) {
    setDeleteDialogFileIds(fileIds);
    setIsDeleteDialogOpen(true);
  }

  function startRename(file: FileListItem) {
    setRenamingFileId(file.id);
    setRenameDraft(file.name);
  }

  function cancelRename() {
    setRenamingFileId(null);
    setRenameDraft("");
  }

  async function commitRename(file: FileListItem) {
    const sanitizedName = sanitizeFilename(renameDraft);

    if (sanitizedName === file.name) {
      cancelRename();
      return;
    }

    const previousFiles = queryClient.getQueryData<FileListItem[]>(filesQueryKey) ?? files;

    updateFilesInCache((currentFiles) =>
      currentFiles.map((currentFile) =>
        currentFile.id === file.id
          ? {
              ...currentFile,
              name: sanitizedName,
              updatedAt: new Date().toISOString(),
            }
          : currentFile,
      ),
    );

    cancelRename();

    try {
      const updatedFile = await renameFileAction(file.id, renameDraft);

      updateFilesInCache((currentFiles) =>
        currentFiles.map((currentFile) =>
          currentFile.id === file.id ? updatedFile : currentFile,
        ),
      );
      toast.success("File renamed");
    } catch (error) {
      queryClient.setQueryData(filesQueryKey, previousFiles);
      toast.error(error instanceof Error ? error.message : "Failed to rename file");
    } finally {
      await invalidateFiles();
    }
  }

  async function confirmMove() {
    if (moveDialogFileIds.length === 0) {
      return;
    }

    const previousFiles = queryClient.getQueryData<FileListItem[]>(filesQueryKey) ?? files;

    updateFilesInCache((currentFiles) =>
      currentFiles.map((file) =>
        moveDialogFileIds.includes(file.id)
          ? { ...file, folderId: moveTargetFolderId, updatedAt: new Date().toISOString() }
          : file,
      ),
    );

    try {
      if (moveDialogFileIds.length === 1) {
        await moveFileAction(moveDialogFileIds[0]!, moveTargetFolderId);
      } else {
        await bulkMoveAction(moveDialogFileIds, moveTargetFolderId);
      }

      setIsMoveDialogOpen(false);
      setMoveDialogFileIds([]);
      clearSelection();
      toast.success(moveDialogFileIds.length > 1 ? "Files moved" : "File moved");
    } catch (error) {
      queryClient.setQueryData(filesQueryKey, previousFiles);
      toast.error(error instanceof Error ? error.message : "Failed to move file");
    } finally {
      await invalidateFiles();
    }
  }

  async function confirmDelete() {
    if (deleteDialogFileIds.length === 0) {
      return;
    }

    const previousFiles = queryClient.getQueryData<FileListItem[]>(filesQueryKey) ?? files;

    updateFilesInCache((currentFiles) =>
      currentFiles.filter((file) => !deleteDialogFileIds.includes(file.id)),
    );

    try {
      if (deleteDialogFileIds.length === 1) {
        await deleteFileAction(deleteDialogFileIds[0]!);
      } else {
        await bulkDeleteAction(deleteDialogFileIds);
      }

      setIsDeleteDialogOpen(false);
      setDeleteDialogFileIds([]);
      clearSelection();
      toast.success(deleteDialogFileIds.length > 1 ? "Files deleted" : "File deleted");
    } catch (error) {
      queryClient.setQueryData(filesQueryKey, previousFiles);
      toast.error(error instanceof Error ? error.message : "Failed to delete file");
    } finally {
      await invalidateFiles();
    }
  }

  async function confirmCreateFolder() {
    try {
      const createdFolder = await createFolderAction(createFolderName, createFolderParentId);
      setFolders((currentFolders) => [...currentFolders, createdFolder]);
      setIsCreateFolderDialogOpen(false);
      setCreateFolderName("");
      toast.success("Folder created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create folder");
    }
  }

  function navigateToFolder(folderId: string | null) {
    React.startTransition(() => {
      setCurrentFolderId(folderId);
      setSelectedFileIds([]);
      setRenamingFileId(null);
      setRenameDraft("");
    });
  }

  function toggleFileSelection(fileId: string) {
    setSelectedFileIds((currentSelection) =>
      currentSelection.includes(fileId)
        ? currentSelection.filter((currentId) => currentId !== fileId)
        : [...currentSelection, fileId],
    );
  }

  function toggleAllVisibleFiles(checked: boolean) {
    if (checked) {
      setSelectedFileIds((currentSelection) => [
        ...new Set([...currentSelection, ...visibleFiles.map((file) => file.id)]),
      ]);
      return;
    }

    setSelectedFileIds((currentSelection) =>
      currentSelection.filter((fileId) => !visibleFiles.some((file) => file.id === fileId)),
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Your files</CardTitle>
            <CardDescription>
              Browse, rename, move, preview, and delete encrypted files without leaving the page.
            </CardDescription>
          </div>
          <div className="rounded-full border border-border/70 px-3 py-2 text-right text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4" />
              {files.length} files
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Button
              className="h-auto px-0 text-sm"
              onClick={() => navigateToFolder(null)}
              type="button"
              variant="link"
            >
              All files
            </Button>
            {currentFolderPath.map((folder) => (
              <React.Fragment key={folder.id}>
                <span>/</span>
                <Button
                  className="h-auto px-0 text-sm"
                  onClick={() => navigateToFolder(folder.id)}
                  type="button"
                  variant="link"
                >
                  {folder.name}
                </Button>
              </React.Fragment>
            ))}
            {isFetching ? (
              <span className="ml-auto inline-flex items-center gap-2">
                <RefreshCcw className="size-4 animate-spin" />
                Refreshing
              </span>
            ) : null}
          </div>

          <Toolbar
            canUpload={canUpload}
            filterValue={filterValue}
            isFetching={isFetching}
            onBulkDelete={() => openDeleteDialog(selectedFileIds)}
            onBulkMove={() => openMoveDialog(selectedFileIds, currentFolderId)}
            onClearSelection={clearSelection}
            onFilterValueChange={setFilterValue}
            onNewFolderClick={() => {
              setCreateFolderParentId(currentFolderId);
              setCreateFolderName("");
              setIsCreateFolderDialogOpen(true);
            }}
            onSortChange={setSort}
            onViewModeChange={setViewMode}
            selectedCount={selectedCount}
            sort={sort}
            viewMode={viewMode}
          />

          {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
              <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                <FolderTree className="size-10 text-muted-foreground" />
                <p className="text-base font-medium">
                  {deferredFilterValue
                    ? "No matching files or folders"
                    : "This folder is empty"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {deferredFilterValue
                    ? "Try a different search term or clear the current filter."
                    : "Upload a file to get started, or move files into this folder from another location."}
                </p>
              </div>
            </div>
          ) : viewMode === "grid" ? (
            <FileGrid
              files={visibleFiles}
              folders={visibleFolders}
              onDelete={(file) => openDeleteDialog([file.id])}
              onFolderOpen={navigateToFolder}
              onMove={(file) => openMoveDialog([file.id], file.folderId)}
              onRenameCancel={cancelRename}
              onRenameChange={setRenameDraft}
              onRenameCommit={commitRename}
              onRenameStart={startRename}
              renameDraft={renameDraft}
              renamingFileId={renamingFileId}
            />
          ) : (
            <FileList
              files={visibleFiles}
              folders={visibleFolders}
              onDelete={(file) => openDeleteDialog([file.id])}
              onFolderOpen={navigateToFolder}
              onMove={(file) => openMoveDialog([file.id], file.folderId)}
              onRenameCancel={cancelRename}
              onRenameChange={setRenameDraft}
              onRenameCommit={commitRename}
              onRenameStart={startRename}
              onSortChange={setSort}
              onToggleAllFiles={toggleAllVisibleFiles}
              onToggleFileSelection={toggleFileSelection}
              renameDraft={renameDraft}
              renamingFileId={renamingFileId}
              selectedFileIds={selectedFileIds}
              sort={sort}
            />
          )}
        </div>

        <Dialog
          onOpenChange={(open) => {
            setIsMoveDialogOpen(open);
            if (!open) {
              setMoveDialogFileIds([]);
            }
          }}
          open={isMoveDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{moveDialogTitle}</DialogTitle>
              <DialogDescription>
                Pick a destination folder. Selecting All files moves the chosen files back to the root.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Button
                className="w-full justify-start"
                onClick={() => setMoveTargetFolderId(null)}
                type="button"
                variant={moveTargetFolderId === null ? "default" : "outline"}
              >
                All files (root)
              </Button>

              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {folders.map((folder) => (
                  <Button
                    key={folder.id}
                    className="w-full justify-start"
                    onClick={() => setMoveTargetFolderId(folder.id)}
                    style={{ paddingLeft: `${getFolderDepth(folder.id, folderMap) * 16 + 12}px` }}
                    type="button"
                    variant={moveTargetFolderId === folder.id ? "default" : "outline"}
                  >
                    {folder.name}
                  </Button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => setIsMoveDialogOpen(false)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button onClick={confirmMove} type="button">
                Move files
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          onOpenChange={setIsCreateFolderDialogOpen}
          open={isCreateFolderDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create folder</DialogTitle>
              <DialogDescription>
                Create a new folder inside {createFolderParentLabel}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Input
                aria-label="Folder name"
                autoFocus
                onChange={(event) => setCreateFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && createFolderName.trim()) {
                    event.preventDefault();
                    void confirmCreateFolder();
                  }
                }}
                placeholder="Folder name"
                value={createFolderName}
              />
              <p className="text-sm text-muted-foreground">
                Parent folder: {createFolderParentLabel}
              </p>
            </div>

            <DialogFooter>
              <Button
                onClick={() => setIsCreateFolderDialogOpen(false)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={!createFolderName.trim()}
                onClick={confirmCreateFolder}
                type="button"
              >
                Create folder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          onOpenChange={(open) => {
            setIsDeleteDialogOpen(open);
            if (!open) {
              setDeleteDialogFileIds([]);
            }
          }}
          open={isDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                This action moves the selected files to trash by setting a soft-delete timestamp.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
