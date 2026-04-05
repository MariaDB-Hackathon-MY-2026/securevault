import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emptyTrash: vi.fn(),
  permanentlyDeleteFile: vi.fn(),
  permanentlyDeleteFolder: vi.fn(),
  restoreFile: vi.fn(),
  restoreFolder: vi.fn(),
  revalidatePath: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("@/app/api/files/service", () => ({
  emptyTrash: mocks.emptyTrash,
  permanentlyDeleteFile: mocks.permanentlyDeleteFile,
  permanentlyDeleteFolder: mocks.permanentlyDeleteFolder,
  restoreFile: mocks.restoreFile,
  restoreFolder: mocks.restoreFolder,
}));

import {
  emptyTrashAction,
  permanentlyDeleteFileAction,
  restoreFileAction,
} from "@/app/(dashboard)/trash/actions";

describe("trash actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-1" });
  });

  it("rejects an empty restore file id before auth or service calls", async () => {
    await expect(restoreFileAction("")).rejects.toThrow("Invalid file ID");

    expect(mocks.requireCurrentUser).not.toHaveBeenCalled();
    expect(mocks.restoreFile).not.toHaveBeenCalled();
  });

  it("revalidates both files and trash after restoring a file", async () => {
    mocks.restoreFile.mockResolvedValueOnce({ id: "file-1", name: "restored.pdf" });

    await restoreFileAction("file-1");

    expect(mocks.restoreFile).toHaveBeenCalledWith("user-1", "file-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/trash");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/files");
  });

  it("revalidates both files and trash after a permanent delete", async () => {
    mocks.permanentlyDeleteFile.mockResolvedValueOnce({
      deletedFiles: 1,
      deletedFolders: 0,
      reclaimedBytes: 1024,
    });

    await permanentlyDeleteFileAction("file-1");

    expect(mocks.permanentlyDeleteFile).toHaveBeenCalledWith("user-1", "file-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/trash");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/files");
  });

  it("requires auth and revalidates both pages when emptying trash", async () => {
    mocks.emptyTrash.mockResolvedValueOnce({
      deletedFiles: 1,
      deletedFolders: 1,
      reclaimedBytes: 2048,
    });

    await emptyTrashAction();

    expect(mocks.requireCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.emptyTrash).toHaveBeenCalledWith("user-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/trash");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/files");
  });
});
