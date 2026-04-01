"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/get-current-user";
import {
  bulkMoveFiles,
  bulkSoftDelete,
  createFolder,
  moveFile,
  renameFile,
  softDeleteFile,
} from "@/app/api/files/service";

const FILES_PATH = "/files";

export async function renameFileAction(fileId: string, newName: string) {
  const user = await requireCurrentUser();
  const result = await renameFile(user.id, fileId, newName);
  revalidatePath(FILES_PATH);
  return result;
}

export async function moveFileAction(fileId: string, targetFolderId: string | null) {
  const user = await requireCurrentUser();
  const result = await moveFile(user.id, fileId, targetFolderId);
  revalidatePath(FILES_PATH);
  return result;
}

export async function deleteFileAction(fileId: string) {
  const user = await requireCurrentUser();
  const result = await softDeleteFile(user.id, fileId);
  revalidatePath(FILES_PATH);
  return result;
}

export async function bulkDeleteAction(fileIds: string[]) {
  const user = await requireCurrentUser();
  const result = await bulkSoftDelete(user.id, fileIds);
  revalidatePath(FILES_PATH);
  return result;
}

export async function bulkMoveAction(fileIds: string[], folderId: string | null) {
  const user = await requireCurrentUser();
  const result = await bulkMoveFiles(user.id, fileIds, folderId);
  revalidatePath(FILES_PATH);
  return result;
}

export async function createFolderAction(name: string, parentId: string | null) {
  const user = await requireCurrentUser();
  const result = await createFolder(user.id, name, parentId);
  revalidatePath(FILES_PATH);
  return result;
}
