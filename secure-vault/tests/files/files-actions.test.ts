import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkMoveFiles: vi.fn(),
  bulkSoftDelete: vi.fn(),
  createFolder: vi.fn(),
  moveFile: vi.fn(),
  renameFile: vi.fn(),
  revalidatePath: vi.fn(),
  requireCurrentUser: vi.fn(),
  softDeleteFile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/app/api/files/service", () => ({
  MAX_BULK_FILE_IDS: 500,
  bulkMoveFiles: mocks.bulkMoveFiles,
  bulkSoftDelete: mocks.bulkSoftDelete,
  createFolder: mocks.createFolder,
  moveFile: mocks.moveFile,
  renameFile: mocks.renameFile,
  softDeleteFile: mocks.softDeleteFile,
}));

import {
  bulkDeleteAction,
  deleteFileAction,
  renameFileAction,
} from "@/app/(dashboard)/files/actions";

describe("files actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("rejects an empty rename file id before hitting auth or the service", async () => {
    await expect(renameFileAction("", "renamed.pdf")).rejects.toThrow("Invalid file ID");

    expect(mocks.requireCurrentUser).not.toHaveBeenCalled();
    expect(mocks.renameFile).not.toHaveBeenCalled();
  });

  it("propagates unauthorized failures from requireCurrentUser", async () => {
    mocks.requireCurrentUser.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(renameFileAction("file-1", "renamed.pdf")).rejects.toThrow("Unauthorized");

    expect(mocks.renameFile).not.toHaveBeenCalled();
  });

  it("revalidates the files path after a successful delete", async () => {
    mocks.softDeleteFile.mockResolvedValueOnce({
      deletedAt: "2026-03-20T00:00:00.000Z",
      fileId: "file-1",
    });

    await expect(deleteFileAction("file-1")).resolves.toEqual({
      deletedAt: "2026-03-20T00:00:00.000Z",
      fileId: "file-1",
    });

    expect(mocks.softDeleteFile).toHaveBeenCalledWith("user-1", "file-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/files");
  });

  it("short-circuits empty bulk deletes without authenticating", async () => {
    await expect(bulkDeleteAction([])).resolves.toEqual({ affectedCount: 0 });

    expect(mocks.requireCurrentUser).not.toHaveBeenCalled();
    expect(mocks.bulkSoftDelete).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
