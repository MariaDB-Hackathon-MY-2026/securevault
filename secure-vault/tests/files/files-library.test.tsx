import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilesLibrary } from "@/components/files/files-library";
import type { FileListItem, FolderListItem } from "@/lib/files/types";

const mocks = vi.hoisted(() => ({
  bulkDeleteAction: vi.fn(),
  bulkMoveAction: vi.fn(),
  createFolderAction: vi.fn(),
  deleteFileAction: vi.fn(),
  deleteFolderAction: vi.fn(),
  moveFileAction: vi.fn(),
  moveFolderAction: vi.fn(),
  renameFileAction: vi.fn(),
  renameFolderAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/(dashboard)/files/actions", () => ({
  bulkDeleteAction: mocks.bulkDeleteAction,
  bulkMoveAction: mocks.bulkMoveAction,
  createFolderAction: mocks.createFolderAction,
  deleteFileAction: mocks.deleteFileAction,
  deleteFolderAction: mocks.deleteFolderAction,
  moveFileAction: mocks.moveFileAction,
  moveFolderAction: mocks.moveFolderAction,
  renameFileAction: mocks.renameFileAction,
  renameFolderAction: mocks.renameFolderAction,
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

  const view = render(
    <QueryClientProvider client={queryClient}>
      <FilesLibrary canUpload={false} initialFiles={files} initialFolders={folders} />
    </QueryClientProvider>,
  );

  return {
    queryClient,
    ...view,
  };
}

function openFolderActions(folderName: string) {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: `Open actions for folder ${folderName}` }),
    { button: 0, ctrlKey: false },
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

  it("optimistically renames a folder from the grid before the action resolves", async () => {
    let resolveRename: ((value: FolderListItem) => void) | null = null;
    mocks.renameFolderAction.mockImplementation(
      () =>
        new Promise<FolderListItem>((resolve) => {
          resolveRename = resolve;
        }),
    );

    renderLibrary([], [createFolder()]);

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    const input = await screen.findByLabelText("Rename folder");

    fireEvent.change(input, { target: { value: "Archives" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Archives")).toBeTruthy();
    expect(mocks.renameFolderAction).toHaveBeenCalledWith("folder-1", "Archives");

    if (resolveRename) {
      (resolveRename as (value: FolderListItem) => void)(
        createFolder({
          name: "Archives",
        }),
      );
    }

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Folder renamed");
    });
  });

  it("rolls a folder rename back when the action fails", async () => {
    mocks.renameFolderAction.mockRejectedValue(new Error("Folder rename failed"));

    renderLibrary([], [createFolder()]);

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    const input = await screen.findByLabelText("Rename folder");

    fireEvent.change(input, { target: { value: "Archives" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Projects")).toBeTruthy();
      expect(mocks.toastError).toHaveBeenCalledWith("Folder rename failed");
    });
  });

  it("does not optimistically rename a folder to the upload fallback for invalid input", async () => {
    renderLibrary([], [createFolder({ name: "Projects" })]);

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    const input = await screen.findByLabelText("Rename folder");

    fireEvent.change(input, { target: { value: "../???" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByText("file")).toBeNull();
    expect(mocks.renameFolderAction).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Folder name is required");
  });

  it("skips folder rename actions when the name does not change", async () => {
    renderLibrary([], [createFolder()]);

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    fireEvent.keyDown(await screen.findByLabelText("Rename folder"), { key: "Enter" });

    expect(mocks.renameFolderAction).not.toHaveBeenCalled();
  });

  it("commits a folder rename only once when Enter is followed by blur", async () => {
    let resolveRename: ((value: FolderListItem) => void) | null = null;
    mocks.renameFolderAction.mockImplementation(
      () =>
        new Promise<FolderListItem>((resolve) => {
          resolveRename = resolve;
        }),
    );

    renderLibrary([], [createFolder()]);

    fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    const input = await screen.findByLabelText("Rename folder");

    fireEvent.change(input, { target: { value: "Archives" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(mocks.renameFolderAction).toHaveBeenCalledTimes(1);

    if (resolveRename) {
      (resolveRename as (value: FolderListItem) => void)(
        createFolder({
          name: "Archives",
        }),
      );
    }

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Folder renamed");
    });
  });

  it("shows subtree counts in the folder delete dialog", () => {
    renderLibrary(
      [
        createFile({ id: "file-1", folderId: "folder-1", name: "budget.pdf" }),
        createFile({ id: "file-2", folderId: "folder-2", name: "taxes.pdf" }),
      ],
      [
        createFolder({ id: "folder-1", name: "Documents" }),
        createFolder({ id: "folder-2", name: "Taxes", parentId: "folder-1" }),
      ],
    );

    openFolderActions("Documents");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.getByText("This will permanently delete 2 files and 1 sub-folder.")).toBeTruthy();
  });

  it("optimistically removes a folder while delete is pending", () => {
    mocks.deleteFolderAction.mockImplementation(
      () => new Promise(() => undefined),
    );

    renderLibrary([], [createFolder()]);

    openFolderActions("Projects");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));

    expect(mocks.deleteFolderAction).toHaveBeenCalledWith("folder-1");
    expect(screen.queryByText("Projects")).toBeNull();
  });

  it("restores a deleted folder when the server action fails", async () => {
    mocks.deleteFolderAction.mockRejectedValue(new Error("Folder delete failed"));

    renderLibrary([], [createFolder()]);

    openFolderActions("Projects");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));

    await waitFor(() => {
      expect(screen.getByText("Projects")).toBeTruthy();
      expect(mocks.toastError).toHaveBeenCalledWith("Folder delete failed");
    });
  });

  it("restores the current folder view when deleting that folder fails", async () => {
    mocks.deleteFolderAction.mockRejectedValue(new Error("Folder delete failed"));

    renderLibrary(
      [createFile({ id: "inside", folderId: "temp", name: "inside.pdf" })],
      [createFolder({ id: "temp", name: "Temp" })],
    );

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    expect(screen.getByRole("button", { name: "inside.pdf" })).toBeTruthy();

    openFolderActions("Temp");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Temp" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "inside.pdf" })).toBeTruthy();
      expect(mocks.toastError).toHaveBeenCalledWith("Folder delete failed");
    });
  });

  it("submits a folder delete only once when the confirm button is clicked repeatedly", () => {
    mocks.deleteFolderAction.mockImplementation(
      () => new Promise(() => undefined),
    );

    renderLibrary([], [createFolder()]);

    openFolderActions("Projects");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    const deleteButton = screen.getByRole("button", { name: "Delete folder" });
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    expect(mocks.deleteFolderAction).toHaveBeenCalledTimes(1);
  });

  it("falls back to the root view when the current folder disappears", async () => {
    const rendered = renderLibrary([], [createFolder({ id: "temp", name: "Temp" })]);

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }));
    expect(screen.getByRole("button", { name: "Temp" })).toBeTruthy();

    rendered.rerender(
      <QueryClientProvider client={rendered.queryClient}>
        <FilesLibrary canUpload={false} initialFiles={[]} initialFolders={[]} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Temp" })).toBeNull();
      expect(screen.getByRole("button", { name: "All files" })).toBeTruthy();
    });
  });

  it("excludes the moved folder from the folder destination list", () => {
    renderLibrary([], [createFolder()]);

    openFolderActions("Projects");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move" }));

    const dialog = screen.getByRole("dialog", { name: "Move folder" });
    expect(within(dialog).queryByRole("button", { name: "Projects" })).toBeNull();
  });

  it("excludes the entire folder subtree from the move destination list", () => {
    renderLibrary(
      [],
      [
        createFolder({ id: "projects", name: "Projects" }),
        createFolder({ id: "taxes", name: "Taxes", parentId: "projects" }),
        createFolder({ id: "archive", name: "Archive" }),
      ],
    );

    openFolderActions("Projects");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move" }));

    const dialog = screen.getByRole("dialog", { name: "Move folder" });
    expect(within(dialog).queryByRole("button", { name: "Projects" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Taxes" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("submits a folder move only once when the confirm button is clicked repeatedly", () => {
    mocks.moveFolderAction.mockImplementation(
      () => new Promise(() => undefined),
    );

    renderLibrary(
      [],
      [
        createFolder({ id: "projects", name: "Projects" }),
        createFolder({ id: "archive", name: "Archive" }),
      ],
    );

    openFolderActions("Projects");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Move folder" })).getByRole("button", {
        name: "Archive",
      }),
    );

    const moveButton = screen.getByRole("button", { name: "Move folder" });
    fireEvent.click(moveButton);
    fireEvent.click(moveButton);

    expect(mocks.moveFolderAction).toHaveBeenCalledTimes(1);
    expect(mocks.moveFolderAction).toHaveBeenCalledWith("projects", "archive");
  });

  it("optimistically updates folder placement after a move", () => {
    mocks.moveFolderAction.mockImplementation(
      () => new Promise(() => undefined),
    );

    renderLibrary(
      [],
      [
        createFolder({ id: "projects", name: "Projects" }),
        createFolder({ id: "archive", name: "Archive" }),
      ],
    );

    openFolderActions("Projects");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Move folder" })).getByRole("button", {
        name: "Archive",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move folder" }));

    expect(screen.queryByText("Projects")).toBeNull();
  });

  it("rolls back folder moves when the action fails", async () => {
    mocks.moveFolderAction.mockRejectedValue(new Error("Folder move failed"));

    renderLibrary(
      [],
      [
        createFolder({ id: "projects", name: "Projects" }),
        createFolder({ id: "archive", name: "Archive" }),
      ],
    );

    openFolderActions("Projects");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Move folder" })).getByRole("button", {
        name: "Archive",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Move folder" }));

    await waitFor(() => {
      expect(screen.getByText("Projects")).toBeTruthy();
      expect(mocks.toastError).toHaveBeenCalledWith("Folder move failed");
    });
  });
});
