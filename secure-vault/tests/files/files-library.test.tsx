import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilesLibrary } from "@/components/files/files-library";
import type { FileListItem, FolderListItem } from "@/lib/files/types";

const mocks = vi.hoisted(() => ({
  bulkDeleteAction: vi.fn(),
  bulkMoveAction: vi.fn(),
  createFolderAction: vi.fn(),
  deleteFileAction: vi.fn(),
  moveFileAction: vi.fn(),
  renameFileAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/(dashboard)/files/actions", () => ({
  bulkDeleteAction: mocks.bulkDeleteAction,
  bulkMoveAction: mocks.bulkMoveAction,
  createFolderAction: mocks.createFolderAction,
  deleteFileAction: mocks.deleteFileAction,
  moveFileAction: mocks.moveFileAction,
  renameFileAction: mocks.renameFileAction,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

function createFile(overrides: Partial<FileListItem> = {}): FileListItem {
  return {
    createdAt: "2026-03-20T00:00:00.000Z",
    folderId: null,
    id: "file-1",
    mimeType: "application/pdf",
    name: "report.pdf",
    size: 1024,
    updatedAt: "2026-03-20T00:00:00.000Z",
    ...overrides,
  };
}

function createFolder(overrides: Partial<FolderListItem> = {}): FolderListItem {
  return {
    createdAt: "2026-03-20T00:00:00.000Z",
    id: "folder-1",
    name: "Projects",
    parentId: null,
    ...overrides,
  };
}

function renderLibrary(files: FileListItem[], folders: FolderListItem[] = []) {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <FilesLibrary canUpload={false} initialFiles={files} initialFolders={folders} />
    </QueryClientProvider>,
  );
}

describe("FilesLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically updates the visible filename before the rename action resolves", async () => {
    let resolveRename: ((value: FileListItem) => void) | null = null;
    mocks.renameFileAction.mockImplementation(
      () =>
        new Promise<FileListItem>((resolve) => {
          resolveRename = resolve;
        }),
    );

    renderLibrary([createFile()]);

    fireEvent.click(screen.getByRole("button", { name: "report.pdf" }));
    fireEvent.change(screen.getByLabelText("Rename file"), {
      target: { value: ' quarter..ly?/report.pdf ' },
    });
    fireEvent.keyDown(screen.getByLabelText("Rename file"), { key: "Enter" });

    expect(screen.getByRole("button", { name: "quarterlyreport.pdf" })).toBeTruthy();
    expect(mocks.renameFileAction).toHaveBeenCalledWith("file-1", " quarter..ly?/report.pdf ");

    if (resolveRename) {
      (resolveRename as (value: FileListItem) => void)(
        createFile({
          name: "quarterlyreport.pdf",
          updatedAt: "2026-03-21T00:00:00.000Z",
        }),
      );
    }

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("File renamed");
    });
  });

  it("commits a rename only once when Enter is followed by blur", async () => {
    let resolveRename: ((value: FileListItem) => void) | null = null;
    mocks.renameFileAction.mockImplementation(
      () =>
        new Promise<FileListItem>((resolve) => {
          resolveRename = resolve;
        }),
    );

    renderLibrary([createFile()]);

    fireEvent.click(screen.getByRole("button", { name: "report.pdf" }));
    const input = screen.getByLabelText("Rename file");

    fireEvent.change(input, { target: { value: "renamed.pdf" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mocks.renameFileAction).toHaveBeenCalledTimes(1);

    if (resolveRename) {
      (resolveRename as (value: FileListItem) => void)(
        createFile({
          name: "renamed.pdf",
          updatedAt: "2026-03-21T00:00:00.000Z",
        }),
      );
    }

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("File renamed");
    });
  });

  it("shows the bulk actions bar when files are selected by checkbox and ctrl+click", async () => {
    renderLibrary([
      createFile(),
      createFile({
        id: "file-2",
        name: "summary.pdf",
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByLabelText("Select report.pdf"));

    const secondRow = screen.getByText("summary.pdf").closest("tr");
    expect(secondRow).not.toBeNull();
    fireEvent.click(secondRow!, { ctrlKey: true });

    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(screen.queryByText("2 selected")).toBeNull();
    });
  });

  it("creates a folder from the toolbar and shows it immediately in the current view", async () => {
    mocks.createFolderAction.mockResolvedValue({
      createdAt: "2026-03-22T00:00:00.000Z",
      id: "folder-1",
      name: "Projects",
      parentId: null,
    });

    renderLibrary([createFile()]);

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.change(screen.getByLabelText("Folder name"), {
      target: { value: "Projects" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));

    await waitFor(() => {
      expect(mocks.createFolderAction).toHaveBeenCalledWith("Projects", null);
    });
    expect(screen.getByText("Projects")).toBeTruthy();
  });

  it("submits create folder only once when the action is triggered repeatedly", async () => {
    let resolveCreate: ((value: FolderListItem) => void) | null = null;
    mocks.createFolderAction.mockImplementation(
      () =>
        new Promise<FolderListItem>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    renderLibrary([createFile()]);

    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.change(screen.getByLabelText("Folder name"), {
      target: { value: "Projects" },
    });

    const createButton = screen.getByRole("button", { name: "Create folder" });
    fireEvent.click(createButton);
    fireEvent.click(createButton);

    expect(mocks.createFolderAction).toHaveBeenCalledTimes(1);
    expect(mocks.createFolderAction).toHaveBeenCalledWith("Projects", null);

    if (resolveCreate) {
      (resolveCreate as (value: FolderListItem) => void)(
        createFolder({
          createdAt: "2026-03-22T00:00:00.000Z",
          id: "folder-2",
          name: "Projects",
          parentId: null,
        }),
      );
    }

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Folder created");
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("submits a move only once when the move button is clicked repeatedly", async () => {
    let resolveMove: ((value: FileListItem) => void) | null = null;
    mocks.moveFileAction.mockImplementation(
      () =>
        new Promise<FileListItem>((resolve) => {
          resolveMove = resolve;
        }),
    );

    renderLibrary([createFile()], [createFolder()]);

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByLabelText("Select report.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    const moveButton = screen.getByRole("button", { name: "Move files" });
    fireEvent.click(moveButton);
    fireEvent.click(moveButton);

    expect(mocks.moveFileAction).toHaveBeenCalledTimes(1);
    expect(mocks.moveFileAction).toHaveBeenCalledWith("file-1", "folder-1");

    if (resolveMove) {
      (resolveMove as (value: FileListItem) => void)(
        createFile({
          folderId: "folder-1",
          updatedAt: "2026-03-21T00:00:00.000Z",
        }),
      );
    }

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("File moved");
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("submits a delete only once when the delete button is clicked repeatedly", async () => {
    let resolveDelete: ((value: { deletedAt: string; fileId: string }) => void) | null = null;
    mocks.deleteFileAction.mockImplementation(
      () =>
        new Promise<{ deletedAt: string; fileId: string }>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    renderLibrary([createFile()]);

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByLabelText("Select report.pdf"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const deleteButton = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(mocks.deleteFileAction).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFileAction).toHaveBeenCalledWith("file-1");

    if (resolveDelete) {
      (resolveDelete as (value: { deletedAt: string; fileId: string }) => void)({
        deletedAt: "2026-03-21T00:00:00.000Z",
        fileId: "file-1",
      });
    }

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("File deleted");
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
