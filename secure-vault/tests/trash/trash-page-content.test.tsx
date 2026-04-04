import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrashPageContent } from "@/components/trash/trash-page-content";
import { filesExplorerQueryKey } from "@/lib/files/files-explorer-query";
import { trashQueryKey, trashSummaryQueryKey } from "@/lib/trash/trash-query";
import type { TrashItem, TrashPageData } from "@/lib/trash/types";

const mocks = vi.hoisted(() => ({
  emptyTrashAction: vi.fn(),
  permanentlyDeleteFileAction: vi.fn(),
  permanentlyDeleteFolderAction: vi.fn(),
  restoreFileAction: vi.fn(),
  restoreFolderAction: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/app/(dashboard)/trash/actions", () => ({
  emptyTrashAction: mocks.emptyTrashAction,
  permanentlyDeleteFileAction: mocks.permanentlyDeleteFileAction,
  permanentlyDeleteFolderAction: mocks.permanentlyDeleteFolderAction,
  restoreFileAction: mocks.restoreFileAction,
  restoreFolderAction: mocks.restoreFolderAction,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

function createTrashFile(overrides: Partial<Extract<TrashItem, { kind: "file" }>> = {}): Extract<TrashItem, { kind: "file" }> {
  return {
    deletedAt: "2026-04-02T00:00:00.000Z",
    folderId: null,
    id: "file-1",
    kind: "file",
    mimeType: "application/pdf",
    name: "report.pdf",
    purgeAt: "2026-05-02T00:00:00.000Z",
    size: 1024,
    ...overrides,
  };
}

function createTrashFolder(overrides: Partial<Extract<TrashItem, { kind: "folder" }>> = {}): Extract<TrashItem, { kind: "folder" }> {
  return {
    deletedAt: "2026-04-02T00:00:00.000Z",
    descendantFileCount: 2,
    descendantFolderCount: 1,
    id: "folder-1",
    kind: "folder",
    name: "Projects",
    parentId: null,
    purgeAt: "2026-05-02T00:00:00.000Z",
    totalBytes: 2048,
    ...overrides,
  };
}

function renderTrash(initialData: TrashPageData) {
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

  const view = render(
    <QueryClientProvider client={queryClient}>
      <TrashPageContent initialData={initialData} />
    </QueryClientProvider>,
  );

  return {
    invalidateSpy,
    queryClient,
    ...view,
  };
}

describe("TrashPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders file and folder trash rows from initial data", () => {
    renderTrash({
      items: [createTrashFolder(), createTrashFile()],
      summary: { rootFileCount: 1, rootFolderCount: 1, totalRootItemCount: 2 },
    });

    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByText("2 files and 1 folder in this deleted subtree")).toBeTruthy();
    expect(screen.getByText("Total size: 2.0 KB")).toBeTruthy();
  });

  it("rolls a restore back and surfaces the exact server error", async () => {
    mocks.restoreFileAction.mockRejectedValue(new Error("Restore the parent folder first"));

    renderTrash({
      items: [createTrashFile()],
      summary: { rootFileCount: 1, rootFolderCount: 0, totalRootItemCount: 1 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.queryByText("report.pdf")).toBeNull();

    await waitFor(() => {
      expect(screen.getByText("report.pdf")).toBeTruthy();
      expect(mocks.toastError).toHaveBeenCalledWith("Restore the parent folder first");
    });
  });

  it("requires confirmation before permanently deleting a file and invalidates related queries", async () => {
    mocks.permanentlyDeleteFileAction.mockResolvedValue({
      deletedFiles: 1,
      deletedFolders: 0,
      reclaimedBytes: 1024,
    });
    const rendered = renderTrash({
      items: [createTrashFile()],
      summary: { rootFileCount: 1, rootFolderCount: 0, totalRootItemCount: 1 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(mocks.permanentlyDeleteFileAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => {
      expect(mocks.permanentlyDeleteFileAction).toHaveBeenCalledWith("file-1");
      expect(rendered.invalidateSpy).toHaveBeenCalledWith({ queryKey: trashQueryKey });
      expect(rendered.invalidateSpy).toHaveBeenCalledWith({ queryKey: trashSummaryQueryKey });
      expect(rendered.invalidateSpy).toHaveBeenCalledWith({ queryKey: filesExplorerQueryKey });
    });
  });

  it("disables empty trash while the action is pending", async () => {
    let resolveEmpty: (() => void) | undefined;
    mocks.emptyTrashAction.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEmpty = () => resolve();
        }),
    );

    renderTrash({
      items: [createTrashFile(), createTrashFolder()],
      summary: { rootFileCount: 1, rootFolderCount: 1, totalRootItemCount: 2 },
    });

    fireEvent.click(screen.getByRole("button", { name: "Empty Trash" }));
    fireEvent.click(screen.getByRole("button", { name: "Empty Trash" }));

    expect(screen.getByRole("button", { name: "Emptying..." }).hasAttribute("disabled")).toBe(true);
    expect(mocks.emptyTrashAction).toHaveBeenCalledTimes(1);

    resolveEmpty?.();

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Trash emptied");
    });
  });
});
