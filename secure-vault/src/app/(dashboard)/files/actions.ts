"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentUser } from "@/lib/auth/get-current-user";
import {
  MAX_BULK_FILE_IDS,
  bulkMoveFiles,
  bulkSoftDelete,
  createFolder,
  moveFile,
  renameFile,
  softDeleteFile,
} from "@/app/api/files/service";

const FILES_PATH = "/files";
const MAX_NAME_LENGTH = 255;

function assertValidId(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${label}`);
  }

  return value.trim();
}

function normalizeOptionalId(value: string | null) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Invalid folder ID");
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue : null;
}

function assertValidName(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }

  if (value.length > MAX_NAME_LENGTH) {
    throw new Error("Name too long");
  }

  return value;
}

function normalizeFileIds(fileIds: string[]) {
  if (!Array.isArray(fileIds)) {
    throw new Error("Invalid file IDs");
  }

  const normalizedIds = fileIds.map((fileId) => assertValidId(fileId, "file ID"));

  if (normalizedIds.length > MAX_BULK_FILE_IDS) {
    throw new Error(`Cannot select more than ${MAX_BULK_FILE_IDS} files at once`);
  }

  return [...new Set(normalizedIds)];
}

export async function renameFileAction(fileId: string, newName: string) {
  const normalizedFileId = assertValidId(fileId, "file ID");
  const validatedName = assertValidName(newName, "New name");
  const user = await requireCurrentUser();
  const result = await renameFile(user.id, normalizedFileId, validatedName);
  revalidatePath(FILES_PATH);
  return result;
}

export async function moveFileAction(fileId: string, targetFolderId: string | null) {
  const normalizedFileId = assertValidId(fileId, "file ID");
  const normalizedTargetFolderId = normalizeOptionalId(targetFolderId);
  const user = await requireCurrentUser();
  const result = await moveFile(user.id, normalizedFileId, normalizedTargetFolderId);
  revalidatePath(FILES_PATH);
  return result;
}

export async function deleteFileAction(fileId: string) {
  const normalizedFileId = assertValidId(fileId, "file ID");
  const user = await requireCurrentUser();
  const result = await softDeleteFile(user.id, normalizedFileId);
  revalidatePath(FILES_PATH);
  return result;
}

export async function bulkDeleteAction(fileIds: string[]) {
  const normalizedFileIds = normalizeFileIds(fileIds);
  if (normalizedFileIds.length === 0) {
    return { affectedCount: 0 };
  }

  const user = await requireCurrentUser();
  const result = await bulkSoftDelete(user.id, normalizedFileIds);
  revalidatePath(FILES_PATH);
  return result;
}

export async function bulkMoveAction(fileIds: string[], folderId: string | null) {
  const normalizedFileIds = normalizeFileIds(fileIds);
  if (normalizedFileIds.length === 0) {
    return { affectedCount: 0 };
  }

  const normalizedFolderId = normalizeOptionalId(folderId);
  const user = await requireCurrentUser();
  const result = await bulkMoveFiles(user.id, normalizedFileIds, normalizedFolderId);
  revalidatePath(FILES_PATH);
  return result;
}

export async function createFolderAction(name: string, parentId: string | null) {
  const validatedName = assertValidName(name, "Folder name");
  const normalizedParentId = normalizeOptionalId(parentId);
  const user = await requireCurrentUser();
  const result = await createFolder(user.id, validatedName, normalizedParentId);
  revalidatePath(FILES_PATH);
  return result;
}
