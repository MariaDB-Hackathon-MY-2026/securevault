"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  getFolderPath,
  matchesExplorerFilter,
} from "@/components/files/file-browser-utils";
import { CreateFolderDialog } from "@/components/files/create-folder-dialog";
import { DeleteFilesDialog } from "@/components/files/delete-files-dialog";
import { FilesBreadcrumbs } from "@/components/files/files-breadcrumbs";
import { FilesEmptyState } from "@/components/files/files-empty-state";
import { FilesLibraryHeader } from "@/components/files/files-library-header";
import { FileGrid } from "@/components/files/file-grid";
import { FileList } from "@/components/files/file-list";
import { MoveFilesDialog } from "@/components/files/move-files-dialog";
import { Toolbar } from "@/components/files/toolbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  const [isMovePending, setIsMovePending] = React.useState(false);
  const [isDeletePending, setIsDeletePending] = React.useState(false);
  const [isCreateFolderPending, setIsCreateFolderPending] = React.useState(false);
  const renameInFlight = React.useRef(false);
  const folderMap = React.useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );

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
    if (renameInFlight.current) {
      return;
    }

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
    renameInFlight.current = true;

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
      renameInFlight.current = false;
      await invalidateFiles();
    }
  }

  async function confirmMove() {
    if (moveDialogFileIds.length === 0 || isMovePending) {
      return;
    }

    const previousFiles = queryClient.getQueryData<FileListItem[]>(filesQueryKey) ?? files;
    setIsMovePending(true);

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
      setIsMovePending(false);
      await invalidateFiles();
    }
  }

  async function confirmDelete() {
    if (deleteDialogFileIds.length === 0 || isDeletePending) {
      return;
    }

    const previousFiles = queryClient.getQueryData<FileListItem[]>(filesQueryKey) ?? files;
    setIsDeletePending(true);

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
      setIsDeletePending(false);
      await invalidateFiles();
    }
  }

  async function confirmCreateFolder() {
    if (isCreateFolderPending) {
      return;
    }

    setIsCreateFolderPending(true);
    try {
      const createdFolder = await createFolderAction(createFolderName, createFolderParentId);
      setFolders((currentFolders) => [...currentFolders, createdFolder]);
      setIsCreateFolderDialogOpen(false);
      setCreateFolderName("");
      toast.success("Folder created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create folder");
    } finally {
      setIsCreateFolderPending(false);
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
        <FilesLibraryHeader fileCount={files.length} />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <FilesBreadcrumbs
            currentFolderPath={currentFolderPath}
            isFetching={isFetching}
            onNavigate={navigateToFolder}
          />

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
            <FilesEmptyState hasFilter={Boolean(deferredFilterValue)} />
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

        <MoveFilesDialog
          folderMap={folderMap}
          folders={folders}
          isOpen={isMoveDialogOpen}
          isPending={isMovePending}
          onConfirm={confirmMove}
          onOpenChange={(open) => {
            setIsMoveDialogOpen(open);
            if (!open) {
              setMoveDialogFileIds([]);
            }
          }}
          onTargetFolderChange={setMoveTargetFolderId}
          selectedFolderId={moveTargetFolderId}
          title={moveDialogTitle}
        />

        <CreateFolderDialog
          isOpen={isCreateFolderDialogOpen}
          isPending={isCreateFolderPending}
          name={createFolderName}
          onConfirm={confirmCreateFolder}
          onNameChange={setCreateFolderName}
          onOpenChange={setIsCreateFolderDialogOpen}
          parentLabel={createFolderParentLabel}
        />

        <DeleteFilesDialog
          isOpen={isDeleteDialogOpen}
          isPending={isDeletePending}
          onConfirm={confirmDelete}
          onOpenChange={(open) => {
            setIsDeleteDialogOpen(open);
            if (!open) {
              setDeleteDialogFileIds([]);
            }
          }}
          title={deleteDialogTitle}
        />
      </CardContent>
    </Card>
  );
}
