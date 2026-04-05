"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/get-current-user";
import {
  emptyTrash,
  permanentlyDeleteFile,
  permanentlyDeleteFolder,
  restoreFile,
  restoreFolder,
} from "@/app/api/files/service";

const FILES_PATH = "/files";
const TRASH_PATH = "/trash";

function assertValidId(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${label}`);
  }

  return value.trim();
}

function revalidateTrashViews() {
  revalidatePath(TRASH_PATH);
  revalidatePath(FILES_PATH);
}

export async function restoreFileAction(fileId: string) {
  const normalizedFileId = assertValidId(fileId, "file ID");
  const user = await requireCurrentUser();
  const result = await restoreFile(user.id, normalizedFileId);
  revalidateTrashViews();
  return result;
}

export async function restoreFolderAction(folderId: string) {
  const normalizedFolderId = assertValidId(folderId, "folder ID");
  const user = await requireCurrentUser();
  const result = await restoreFolder(user.id, normalizedFolderId);
  revalidateTrashViews();
  return result;
}

export async function permanentlyDeleteFileAction(fileId: string) {
  const normalizedFileId = assertValidId(fileId, "file ID");
  const user = await requireCurrentUser();
  const result = await permanentlyDeleteFile(user.id, normalizedFileId);
  revalidateTrashViews();
  return result;
}

export async function permanentlyDeleteFolderAction(folderId: string) {
  const normalizedFolderId = assertValidId(folderId, "folder ID");
  const user = await requireCurrentUser();
  const result = await permanentlyDeleteFolder(user.id, normalizedFolderId);
  revalidateTrashViews();
  return result;
}

export async function emptyTrashAction() {
  const user = await requireCurrentUser();
  const result = await emptyTrash(user.id);
  revalidateTrashViews();
  return result;
}
