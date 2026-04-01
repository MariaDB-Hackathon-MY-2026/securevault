import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilesLibrary } from "@/components/files/files-library";
import type { FileListItem } from "@/lib/files/types";

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

function renderLibrary(files: FileListItem[]) {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <FilesLibrary canUpload={false} initialFiles={files} initialFolders={[]} />
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
    fireEvent.change(screen.getByLabelText("Rename report.pdf"), {
      target: { value: ' quarter..ly?/report.pdf ' },
    });
    fireEvent.keyDown(screen.getByLabelText("Rename report.pdf"), { key: "Enter" });

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
});
