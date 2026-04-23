"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  bulkDeleteAction,
  bulkMoveAction,
  createFolderAction,
  deleteFileAction,
  deleteFolderAction,
  moveFileAction,
  moveFolderAction,
  renameFileAction,
  renameFolderAction,
} from "@/app/(dashboard)/files/actions";
import {
  compareFiles,
  compareFolders,
  type FileSortState,
  type FilesViewMode,
  getNearestSurvivingFolderId,
  getFolderPath,
  getFolderSubtreeIds,
} from "@/components/files/file-browser-utils";
import { CreateFolderDialog } from "@/components/files/create-folder-dialog";
import { DeleteFilesDialog } from "@/components/files/delete-files-dialog";
import { FileSearchResults } from "@/components/files/file-search-results";
import { FilesBreadcrumbs } from "@/components/files/files-breadcrumbs";
import { FilesEmptyState } from "@/components/files/files-empty-state";
import { FilesLibraryHeader } from "@/components/files/files-library-header";
import { FileGrid } from "@/components/files/file-grid";
import { FileList } from "@/components/files/file-list";
import { MoveFilesDialog } from "@/components/files/move-files-dialog";
import { Toolbar } from "@/components/files/toolbar";
import { CreateShareDialog } from "@/components/share/create-share-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useFilenameSearchQuery } from "@/hooks/use-filename-search-query";
import {
  SemanticSearchDisabledError,
  SemanticSearchUnavailableError,
  useSemanticSearchQuery,
} from "@/hooks/use-semantic-search-query";
import { useFilesExplorerQuery } from "@/hooks/use-files-explorer-query";
import { sanitizeFilename } from "@/lib/crypto/sanitize";
import { currentUserQueryKey } from "@/lib/auth/current-user-client";
import { filesExplorerQueryKey } from "@/lib/files/files-explorer-query";
import { storageDashboardQueryKey } from "@/lib/files/storage-dashboard-query";
import type {
  FileListItem,
  FilesExplorerData,
  FolderListItem,
} from "@/lib/files/types";
import {
  DEFAULT_FILENAME_SEARCH_ENABLED,
  readFilenameSearchPreference,
} from "@/lib/search/search-preferences";
import type { FilenameSearchResult, SearchMode, SemanticSearchResult } from "@/lib/search/types";
import { trashQueryKey, trashSummaryQueryKey } from "@/lib/trash/trash-query";

type FilesLibraryProps = {
  canUpload: boolean;
  initialFiles: FileListItem[];
  initialFolders: FolderListItem[];
  semanticSearchEnabled?: boolean;
};

type RenameState =
  | { id: string; type: "file" }
  | { id: string; type: "folder" }
  | null;

type MoveDialogState =
  | { fileIds: string[]; targetFolderId: string | null; type: "files" }
  | { folderId: string; targetFolderId: string | null; type: "folder" }
  | null;

type DeleteDialogState =
  | { fileIds: string[]; type: "files" }
  | { folderId: string; type: "folder" }
  | null;

type ShareDialogState =
  | { id: string; name: string; type: "file" | "folder" }
  | null;

const defaultSort: FileSortState = {
  direction: "desc",
  key: "updatedAt",
};

function formatCount(count: number, singularLabel: string, pluralLabel = `${singularLabel}s`) {
  return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}

export function FilesLibrary({
  canUpload,
  initialFiles,
  initialFolders,
  semanticSearchEnabled = false,
}: FilesLibraryProps) {
  const queryClient = useQueryClient();
  const initialExplorerData = React.useMemo<FilesExplorerData>(() => ({
    files: initialFiles,
    folders: initialFolders,
  }), [initialFiles, initialFolders]);
  const { data: explorerData = initialExplorerData, isFetching } =
    useFilesExplorerQuery(initialExplorerData);
  const { files, folders } = explorerData;
  const [viewMode, setViewMode] = React.useState<FilesViewMode>("grid");
  const [sort, setSort] = React.useState<FileSortState>(defaultSort);
  const [filterValue, setFilterValue] = React.useState("");
  const [filenameSearchEnabled, setFilenameSearchEnabled] = React.useState(
    DEFAULT_FILENAME_SEARCH_ENABLED,
  );
  const deferredFilterValue = React.useDeferredValue(filterValue);
  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = React.useState<string[]>([]);
  const [renameState, setRenameState] = React.useState<RenameState>(null);
  const [renameDraft, setRenameDraft] = React.useState("");
  const [createFolderName, setCreateFolderName] = React.useState("");
  const [createFolderParentId, setCreateFolderParentId] = React.useState<string | null>(null);
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] = React.useState(false);
  const [moveDialogState, setMoveDialogState] = React.useState<MoveDialogState>(null);
  const [deleteDialogState, setDeleteDialogState] = React.useState<DeleteDialogState>(null);
  const [shareDialogState, setShareDialogState] = React.useState<ShareDialogState>(null);
  const [isMovePending, setIsMovePending] = React.useState(false);
  const [isDeletePending, setIsDeletePending] = React.useState(false);
  const [isCreateFolderPending, setIsCreateFolderPending] = React.useState(false);
  const renameInFlight = React.useRef(false);
  const folderMap = React.useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const {
    data: filenameSearchData,
    error: filenameSearchError,
    isError: isFilenameSearchError,
    isFetching: isFilenameSearchFetching,
  } = useFilenameSearchQuery({
    query: filenameSearchEnabled ? deferredFilterValue : "",
  });
  const {
    data: semanticSearchData,
    error: semanticSearchError,
    isError: isSemanticSearchError,
    isFetching: isSemanticSearchFetching,
  } = useSemanticSearchQuery({
    enabled: !filenameSearchEnabled && semanticSearchEnabled,
    query: deferredFilterValue,
  });
  const searchMode: SearchMode = filenameSearchEnabled ? "filename" : "semantic";
  const renamingFileId = renameState?.type === "file" ? renameState.id : null;
  const renamingFolderId = renameState?.type === "folder" ? renameState.id : null;
  const normalizedSearchQuery = filterValue.trim();
  const isSearchActive = normalizedSearchQuery.length > 0;
  const isSearchInputPending = filterValue.trim() !== deferredFilterValue.trim();
  const hasValidSearchQuery = deferredFilterValue.trim().length >= 2;
  const filenameSearchResults = React.useMemo(
    () => filenameSearchData?.results ?? [],
    [filenameSearchData],
  );
  const semanticSearchResults = React.useMemo(
    () => semanticSearchData?.results ?? [],
    [semanticSearchData],
  );

  React.useEffect(() => {
    setSelectedFileIds((currentSelection) =>
      currentSelection.filter((fileId) => files.some((file) => file.id === fileId)),
    );
  }, [files]);

  React.useEffect(() => {
    if (!renameState) {
      return;
    }

    if (renameState.type === "file" && !files.some((file) => file.id === renameState.id)) {
      setRenameState(null);
      setRenameDraft("");
      return;
    }

    if (renameState.type === "folder" && !folderMap.has(renameState.id)) {
      setRenameState(null);
      setRenameDraft("");
    }
  }, [files, folderMap, renameState]);

  React.useEffect(() => {
    if (currentFolderId && !folderMap.has(currentFolderId)) {
      React.startTransition(() => {
        setCurrentFolderId(null);
      });
    }
  }, [currentFolderId, folderMap]);

  React.useEffect(() => {
    const syncPreference = () => {
      setFilenameSearchEnabled(readFilenameSearchPreference());
    };

    syncPreference();
    window.addEventListener("storage", syncPreference);

    return () => {
      window.removeEventListener("storage", syncPreference);
    };
  }, []);

  React.useEffect(() => {
    if (!isSearchActive) {
      return;
    }

    setSelectedFileIds([]);
    setRenameState(null);
    setRenameDraft("");
    setDeleteDialogState(null);
    setMoveDialogState(null);
    setShareDialogState(null);
    setIsCreateFolderDialogOpen(false);
  }, [isSearchActive]);

  const visibleFolders = [...folders.filter((folder) => folder.parentId === currentFolderId)].sort((left, right) =>
    compareFolders(left, right, sort),
  );
  const visibleFiles = [...files.filter((file) => file.folderId === currentFolderId)].sort((left, right) =>
    compareFiles(left, right, sort),
  );
  const sortedFilenameSearchResults = React.useMemo(
    () =>
      [...filenameSearchResults].sort((left, right) => {
        if (sort.key === "size") {
          const sizeComparison = left.size - right.size;
          if (sizeComparison !== 0) {
            return sort.direction === "asc" ? sizeComparison : -sizeComparison;
          }
        }

        if (sort.key === "updatedAt") {
          const dateComparison =
            new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
          if (dateComparison !== 0) {
            return sort.direction === "asc" ? dateComparison : -dateComparison;
          }
        }

        return left.name.localeCompare(right.name, "en", {
          numeric: true,
          sensitivity: "base",
        }) * (sort.direction === "asc" ? 1 : -1);
      }),
    [filenameSearchResults, sort],
  );
  const currentFolderPath = getFolderPath(currentFolderId, folderMap);
  const currentFolder = currentFolderId ? folderMap.get(currentFolderId) ?? null : null;
  const currentFolderName = currentFolder?.name ?? "All files";
  const visibleItemCount = visibleFolders.length + visibleFiles.length;
  const selectedCount = selectedFileIds.length;
  const createFolderParentLabel = createFolderParentId
    ? folderMap.get(createFolderParentId)?.name ?? "Selected folder"
    : "All files";
  const moveDialogTitle =
    moveDialogState?.type === "folder"
      ? "Move folder"
      : moveDialogState && moveDialogState.fileIds.length > 1
        ? `Move ${moveDialogState.fileIds.length} files`
        : "Move file";
  const moveDialogDescription =
    moveDialogState?.type === "folder"
      ? "Pick a destination folder. The current folder and its descendants are excluded to prevent circular moves. Selecting All files moves the folder back to the root."
      : "Pick a destination folder. Selecting All files moves the chosen files back to the root.";
  const moveDialogConfirmLabel = moveDialogState?.type === "folder" ? "Move folder" : "Move files";
  const moveDialogFolders = React.useMemo(() => {
    if (moveDialogState?.type !== "folder") {
      return folders;
    }

    const excludedFolderIds = new Set(getFolderSubtreeIds(moveDialogState.folderId, folderMap));
    return folders.filter((folder) => !excludedFolderIds.has(folder.id));
  }, [folderMap, folders, moveDialogState]);
  const deleteDialogTitle =
    deleteDialogState?.type === "folder"
      ? "Delete folder"
      : deleteDialogState && deleteDialogState.fileIds.length > 1
        ? `Delete ${deleteDialogState.fileIds.length} files`
        : "Delete file";
  const folderDeleteDetails = React.useMemo(() => {
    if (deleteDialogState?.type !== "folder") {
      return null;
    }

    const subtreeFolderIds = getFolderSubtreeIds(deleteDialogState.folderId, folderMap);
    const subtreeFolderIdSet = new Set(subtreeFolderIds);
    const deletedFileCount = files.filter(
      (file) => file.folderId && subtreeFolderIdSet.has(file.folderId),
    ).length;

    return {
      deletedFileCount,
      descendantFolderCount: Math.max(subtreeFolderIds.length - 1, 0),
      subtreeFolderIds,
    };
  }, [deleteDialogState, files, folderMap]);
  const deleteDialogDescription =
    deleteDialogState?.type === "folder"
      ? `This will permanently delete ${formatCount(
          folderDeleteDetails?.deletedFileCount ?? 0,
          "file",
        )} and ${formatCount(
          folderDeleteDetails?.descendantFolderCount ?? 0,
          "sub-folder",
          "sub-folders",
        )}.`
      : undefined;
  const deleteDialogConfirmLabel = deleteDialogState?.type === "folder" ? "Delete folder" : "Delete";

  function getExplorerDataFromCache() {
    return queryClient.getQueryData<FilesExplorerData>(filesExplorerQueryKey) ?? explorerData;
  }

  async function invalidateExplorer() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: filesExplorerQueryKey }),
      queryClient.invalidateQueries({ queryKey: storageDashboardQueryKey }),
      queryClient.invalidateQueries({ queryKey: currentUserQueryKey }),
    ]);
  }

  async function invalidateTrash() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trashQueryKey }),
      queryClient.invalidateQueries({ queryKey: trashSummaryQueryKey }),
    ]);
  }

  function updateExplorerDataInCache(
    updater: (currentData: FilesExplorerData) => FilesExplorerData,
  ) {
    queryClient.setQueryData<FilesExplorerData>(filesExplorerQueryKey, (currentData) =>
      updater(currentData ?? explorerData),
    );
  }

  function updateFilesInCache(
    updater: (currentFiles: FileListItem[]) => FileListItem[],
  ) {
    updateExplorerDataInCache((currentData) => ({
      ...currentData,
      files: updater(currentData.files),
    }));
  }

  function updateFoldersInCache(
    updater: (currentFolders: FolderListItem[]) => FolderListItem[],
  ) {
    updateExplorerDataInCache((currentData) => ({
      ...currentData,
      folders: updater(currentData.folders),
    }));
  }

  function clearSelection() {
    setSelectedFileIds([]);
  }

  function clearTransientExplorerState() {
    setSelectedFileIds([]);
    setRenameState(null);
    setRenameDraft("");
    setDeleteDialogState(null);
    setMoveDialogState(null);
    setShareDialogState(null);
    setIsCreateFolderDialogOpen(false);
  }

  function openFileMoveDialog(fileIds: string[], targetFolderId: string | null) {
    setMoveDialogState({ fileIds, targetFolderId, type: "files" });
  }

  function openFolderMoveDialog(folder: FolderListItem) {
    setMoveDialogState({
      folderId: folder.id,
      targetFolderId: folder.parentId,
      type: "folder",
    });
  }

  function openFileDeleteDialog(fileIds: string[]) {
    setDeleteDialogState({ fileIds, type: "files" });
  }

  function openFolderDeleteDialog(folder: FolderListItem) {
    setDeleteDialogState({ folderId: folder.id, type: "folder" });
  }

  function openFileShareDialog(file: FileListItem) {
    setShareDialogState({ id: file.id, name: file.name, type: "file" });
  }

  function openFolderShareDialog(folder: FolderListItem) {
    setShareDialogState({ id: folder.id, name: folder.name, type: "folder" });
  }

  function startFileRename(file: FileListItem) {
    setRenameState({ id: file.id, type: "file" });
    setRenameDraft(file.name);
  }

  function startFolderRename(folder: FolderListItem) {
    setRenameState({ id: folder.id, type: "folder" });
    setRenameDraft(folder.name);
  }

  function cancelRename() {
    setRenameState(null);
    setRenameDraft("");
  }

  async function commitFileRename(file: FileListItem) {
    if (renameInFlight.current) {
      return;
    }

    const sanitizedName = sanitizeFilename(renameDraft);

    if (sanitizedName === file.name) {
      cancelRename();
      return;
    }

    const previousExplorerData = getExplorerDataFromCache();
    renameInFlight.current = true;

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
      queryClient.setQueryData(filesExplorerQueryKey, previousExplorerData);
      toast.error(error instanceof Error ? error.message : "Failed to rename file");
    } finally {
      renameInFlight.current = false;
      await invalidateExplorer();
    }
  }

  async function commitFolderRename(folder: FolderListItem) {
    if (renameInFlight.current) {
      return;
    }

    const sanitizedName = sanitizeFilename(renameDraft, {
      fallback: "",
      truncate: false,
    });

    if (!sanitizedName) {
      cancelRename();
      toast.error("Folder name is required");
      return;
    }

    if (sanitizedName === folder.name) {
      cancelRename();
      return;
    }

    const previousExplorerData = getExplorerDataFromCache();
    renameInFlight.current = true;
    updateFoldersInCache((currentFolders) =>
      currentFolders.map((currentFolder) =>
        currentFolder.id === folder.id
          ? { ...currentFolder, name: sanitizedName }
          : currentFolder,
      ),
    );

    cancelRename();

    try {
      const updatedFolder = await renameFolderAction(folder.id, renameDraft);
      updateFoldersInCache((currentFolders) =>
        currentFolders.map((currentFolder) =>
          currentFolder.id === folder.id ? updatedFolder : currentFolder,
        ),
      );
      toast.success("Folder renamed");
    } catch (error) {
      queryClient.setQueryData(filesExplorerQueryKey, previousExplorerData);
      toast.error(error instanceof Error ? error.message : "Failed to rename folder");
    } finally {
      renameInFlight.current = false;
      await invalidateExplorer();
    }
  }

  async function confirmMove() {
    if (!moveDialogState || isMovePending) {
      return;
    }

    setIsMovePending(true);

    if (moveDialogState.type === "files") {
      const previousExplorerData = getExplorerDataFromCache();

      updateFilesInCache((currentFiles) =>
        currentFiles.map((file) =>
          moveDialogState.fileIds.includes(file.id)
            ? {
                ...file,
                folderId: moveDialogState.targetFolderId,
                updatedAt: new Date().toISOString(),
              }
            : file,
        ),
      );

      try {
        if (moveDialogState.fileIds.length === 1) {
          await moveFileAction(moveDialogState.fileIds[0]!, moveDialogState.targetFolderId);
        } else {
          await bulkMoveAction(moveDialogState.fileIds, moveDialogState.targetFolderId);
        }

        setMoveDialogState(null);
        clearSelection();
        toast.success(moveDialogState.fileIds.length > 1 ? "Files moved" : "File moved");
      } catch (error) {
        queryClient.setQueryData(filesExplorerQueryKey, previousExplorerData);
        toast.error(error instanceof Error ? error.message : "Failed to move file");
      } finally {
        setIsMovePending(false);
        await invalidateExplorer();
      }

      return;
    }

    const previousExplorerData = getExplorerDataFromCache();
    updateFoldersInCache((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === moveDialogState.folderId
          ? { ...folder, parentId: moveDialogState.targetFolderId }
          : folder,
      ),
    );

    try {
      const updatedFolder = await moveFolderAction(
        moveDialogState.folderId,
        moveDialogState.targetFolderId,
      );
      updateFoldersInCache((currentFolders) =>
        currentFolders.map((folder) =>
          folder.id === moveDialogState.folderId ? updatedFolder : folder,
        ),
      );
      setMoveDialogState(null);
      toast.success("Folder moved");
    } catch (error) {
      queryClient.setQueryData(filesExplorerQueryKey, previousExplorerData);
      toast.error(error instanceof Error ? error.message : "Failed to move folder");
    } finally {
      setIsMovePending(false);
      await invalidateExplorer();
    }
  }

  async function confirmDelete() {
    if (!deleteDialogState || isDeletePending) {
      return;
    }

    setIsDeletePending(true);

    if (deleteDialogState.type === "files") {
      const previousExplorerData = getExplorerDataFromCache();

      updateFilesInCache((currentFiles) =>
        currentFiles.filter((file) => !deleteDialogState.fileIds.includes(file.id)),
      );

      try {
        if (deleteDialogState.fileIds.length === 1) {
          await deleteFileAction(deleteDialogState.fileIds[0]!);
        } else {
          await bulkDeleteAction(deleteDialogState.fileIds);
        }

        setDeleteDialogState(null);
        clearSelection();
        await invalidateTrash();
        toast.success(deleteDialogState.fileIds.length > 1 ? "Files deleted" : "File deleted");
      } catch (error) {
        queryClient.setQueryData(filesExplorerQueryKey, previousExplorerData);
        toast.error(error instanceof Error ? error.message : "Failed to delete file");
      } finally {
        setIsDeletePending(false);
        await invalidateExplorer();
      }

      return;
    }

    const subtreeFolderIds = folderDeleteDetails?.subtreeFolderIds ?? [deleteDialogState.folderId];
    const subtreeFolderIdSet = new Set(subtreeFolderIds);
    const previousExplorerData = getExplorerDataFromCache();
    const previousCurrentFolderId = currentFolderId;
    const fallbackFolderId = getNearestSurvivingFolderId(
      deleteDialogState.folderId,
      folderMap,
      subtreeFolderIdSet,
    );

    if (currentFolderId && subtreeFolderIdSet.has(currentFolderId)) {
      React.startTransition(() => {
        setCurrentFolderId(fallbackFolderId);
      });
    }

    updateFoldersInCache((currentFolders) =>
      currentFolders.filter((folder) => !subtreeFolderIdSet.has(folder.id)),
    );
    updateFilesInCache((currentFiles) =>
      currentFiles.filter((file) => !file.folderId || !subtreeFolderIdSet.has(file.folderId)),
    );

    try {
      await deleteFolderAction(deleteDialogState.folderId);
      setDeleteDialogState(null);
      await invalidateTrash();
      toast.success("Folder deleted");
    } catch (error) {
      queryClient.setQueryData(filesExplorerQueryKey, previousExplorerData);
      React.startTransition(() => {
        setCurrentFolderId(previousCurrentFolderId);
      });
      toast.error(error instanceof Error ? error.message : "Failed to delete folder");
    } finally {
      setIsDeletePending(false);
      await invalidateExplorer();
    }
  }

  async function confirmCreateFolder() {
    if (isCreateFolderPending) {
      return;
    }

    setIsCreateFolderPending(true);
    try {
      const createdFolder = await createFolderAction(createFolderName, createFolderParentId);
      updateFoldersInCache((currentFolders) => [...currentFolders, createdFolder]);
      setIsCreateFolderDialogOpen(false);
      setCreateFolderName("");
      toast.success("Folder created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create folder");
    } finally {
      setIsCreateFolderPending(false);
      await invalidateExplorer();
    }
  }

  function navigateToFolder(folderId: string | null) {
    React.startTransition(() => {
      setCurrentFolderId(folderId);
    });
    clearTransientExplorerState();
  }

  function openSearchResultFolder(result: FilenameSearchResult | SemanticSearchResult) {
    clearTransientExplorerState();
    React.startTransition(() => {
      setCurrentFolderId(result.folderId);
      setFilterValue("");
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

  function renderFilenameSearchSurface() {
    if (!filterValue.trim()) {
      return (
        <FilesEmptyState
          mode="filename"
          state="blank"
        />
      );
    }

    if (isSearchInputPending) {
      return (
        <FilesEmptyState
          mode="filename"
          state="loading"
        />
      );
    }

    if (!hasValidSearchQuery) {
      return (
        <FilesEmptyState
          mode="filename"
          state="short"
        />
      );
    }

    if (isFilenameSearchError) {
      return (
        <FilesEmptyState
          message={filenameSearchError instanceof Error ? filenameSearchError.message : undefined}
          mode="filename"
          state="error"
        />
      );
    }

    if (isFilenameSearchFetching && filenameSearchResults.length === 0) {
      return (
        <FilesEmptyState
          mode="filename"
          state="loading"
        />
      );
    }

    if (filenameSearchResults.length === 0) {
      return (
        <FilesEmptyState
          mode="filename"
          query={deferredFilterValue}
          state="empty"
        />
      );
    }

    return (
      <FileSearchResults
        isRefreshing={isFilenameSearchFetching}
        onOpenFolder={openSearchResultFolder}
        results={sortedFilenameSearchResults}
      />
    );
  }

  function renderSemanticSearchSurface() {
    if (!semanticSearchEnabled) {
      return (
        <FilesEmptyState
          message="This deployment has semantic search turned off."
          mode="semantic"
          state="disabled"
        />
      );
    }

    if (!filterValue.trim()) {
      return (
        <FilesEmptyState
          mode="semantic"
          state="blank"
        />
      );
    }

    if (isSearchInputPending) {
      return (
        <FilesEmptyState
          mode="semantic"
          state="loading"
        />
      );
    }

    if (!hasValidSearchQuery) {
      return (
        <FilesEmptyState
          mode="semantic"
          state="short"
        />
      );
    }

    if (isSemanticSearchError) {
      const message = semanticSearchError instanceof SemanticSearchDisabledError
        || semanticSearchError instanceof SemanticSearchUnavailableError
        || semanticSearchError instanceof Error
        ? semanticSearchError.message
        : undefined;
      const state = semanticSearchError instanceof SemanticSearchDisabledError ? "disabled" : "error";

      return (
        <FilesEmptyState
          message={message}
          mode="semantic"
          query={deferredFilterValue}
          state={state}
        />
      );
    }

    if (isSemanticSearchFetching && semanticSearchResults.length === 0) {
      return (
        <FilesEmptyState
          mode="semantic"
          state="loading"
        />
      );
    }

    if (semanticSearchResults.length === 0) {
      return (
        <FilesEmptyState
          mode="semantic"
          query={deferredFilterValue}
          state="empty"
        />
      );
    }

    return (
      <FileSearchResults
        isRefreshing={isSemanticSearchFetching}
        onOpenFolder={openSearchResultFolder}
        results={semanticSearchResults}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <FilesLibraryHeader
          currentFolderName={currentFolderName}
          itemCount={
            isSearchActive && searchMode === "filename"
              ? isSearchInputPending || !hasValidSearchQuery
                ? 0
                : filenameSearchResults.length
              : isSearchActive && searchMode === "semantic"
                ? isSearchInputPending || !hasValidSearchQuery
                  ? 0
                  : semanticSearchResults.length
                : visibleItemCount
          }
          query={normalizedSearchQuery}
          searchMode={searchMode}
        />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {!isSearchActive ? (
            <FilesBreadcrumbs
              currentFolderPath={currentFolderPath}
              currentFolder={currentFolder}
              currentFolderActions={
                currentFolder
                  ? {
                      onDelete: openFolderDeleteDialog,
                      onMove: openFolderMoveDialog,
                      onRename: startFolderRename,
                      onShare: openFolderShareDialog,
                    }
                  : undefined
              }
              isFetching={isFetching}
              onNavigate={navigateToFolder}
              onRenameCancel={cancelRename}
              onRenameChange={setRenameDraft}
              onRenameCommit={commitFolderRename}
              renameDraft={renameDraft}
              renamingFolderId={renamingFolderId}
            />
          ) : null}

          <Toolbar
            canUpload={canUpload}
            filterValue={filterValue}
            isFetching={
              isSearchActive && searchMode === "filename"
                ? isFilenameSearchFetching
                : isSearchActive && searchMode === "semantic"
                  ? isSemanticSearchFetching
                  : isFetching
            }
            onBulkDelete={() => openFileDeleteDialog(selectedFileIds)}
            onBulkMove={() => openFileMoveDialog(selectedFileIds, currentFolderId)}
            onClearSelection={clearSelection}
            onFilterValueChange={setFilterValue}
            onNewFolderClick={() => {
              setCreateFolderParentId(currentFolderId);
              setCreateFolderName("");
              setIsCreateFolderDialogOpen(true);
            }}
            onSortChange={setSort}
            onViewModeChange={setViewMode}
            searchMode={searchMode}
            searchQuery={filterValue}
            semanticSearchEnabled={semanticSearchEnabled}
            selectedCount={selectedCount}
            sort={sort}
            viewMode={viewMode}
          />

          {isSearchActive ? (
            searchMode === "filename" ? renderFilenameSearchSurface() : renderSemanticSearchSurface()
          ) : visibleFolders.length === 0 && visibleFiles.length === 0 ? (
            <FilesEmptyState hasFilter={false} mode="filter" />
          ) : viewMode === "grid" ? (
            <FileGrid
              files={visibleFiles}
              folders={visibleFolders}
              onDelete={(file) => openFileDeleteDialog([file.id])}
              onFolderDelete={openFolderDeleteDialog}
              onFolderMove={openFolderMoveDialog}
              onFolderOpen={navigateToFolder}
              onFolderShare={openFolderShareDialog}
              onShare={openFileShareDialog}
              onFolderRenameCancel={cancelRename}
              onFolderRenameChange={setRenameDraft}
              onFolderRenameCommit={commitFolderRename}
              onFolderRenameStart={startFolderRename}
              onMove={(file) => openFileMoveDialog([file.id], file.folderId)}
              onRenameCancel={cancelRename}
              onRenameChange={setRenameDraft}
              onRenameCommit={commitFileRename}
              onRenameStart={startFileRename}
              renameDraft={renameDraft}
              renamingFileId={renamingFileId}
              renamingFolderId={renamingFolderId}
              semanticSearchEnabled={semanticSearchEnabled}
            />
          ) : (
            <FileList
              files={visibleFiles}
              folders={visibleFolders}
              onDelete={(file) => openFileDeleteDialog([file.id])}
              onFolderDelete={openFolderDeleteDialog}
              onFolderMove={openFolderMoveDialog}
              onFolderOpen={navigateToFolder}
              onFolderShare={openFolderShareDialog}
              onShare={openFileShareDialog}
              onFolderRenameCancel={cancelRename}
              onFolderRenameChange={setRenameDraft}
              onFolderRenameCommit={commitFolderRename}
              onFolderRenameStart={startFolderRename}
              onMove={(file) => openFileMoveDialog([file.id], file.folderId)}
              onRenameCancel={cancelRename}
              onRenameChange={setRenameDraft}
              onRenameCommit={commitFileRename}
              onRenameStart={startFileRename}
              onSortChange={setSort}
              onToggleAllFiles={toggleAllVisibleFiles}
              onToggleFileSelection={toggleFileSelection}
              renameDraft={renameDraft}
              renamingFileId={renamingFileId}
              renamingFolderId={renamingFolderId}
              selectedFileIds={selectedFileIds}
              semanticSearchEnabled={semanticSearchEnabled}
              sort={sort}
            />
          )}
        </div>

        <MoveFilesDialog
          confirmLabel={moveDialogConfirmLabel}
          description={moveDialogDescription}
          folderMap={folderMap}
          folders={moveDialogFolders}
          isOpen={moveDialogState !== null}
          isPending={isMovePending}
          onConfirm={confirmMove}
          onOpenChange={(open) => {
            if (!open) {
              setMoveDialogState(null);
            }
          }}
          onTargetFolderChange={(targetFolderId) => {
            setMoveDialogState((currentState) =>
              currentState
                ? {
                    ...currentState,
                    targetFolderId,
                  }
                : currentState,
            );
          }}
          selectedFolderId={moveDialogState?.targetFolderId ?? null}
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
          confirmLabel={deleteDialogConfirmLabel}
          description={deleteDialogDescription}
          isOpen={deleteDialogState !== null}
          isPending={isDeletePending}
          onConfirm={confirmDelete}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteDialogState(null);
            }
          }}
          title={deleteDialogTitle}
        />

        {shareDialogState && (
          <CreateShareDialog
            isOpen={true}
            onOpenChange={(open) => {
              if (!open) {
                setShareDialogState(null);
              }
            }}
            targetType={shareDialogState.type}
            targetId={shareDialogState.id}
            targetName={shareDialogState.name}
          />
        )}
      </CardContent>
    </Card>
  );
}
