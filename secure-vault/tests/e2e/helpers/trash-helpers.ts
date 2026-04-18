import { and, eq } from "drizzle-orm";
import { expect, type Locator, type Page } from "@playwright/test";

import {
  moveFile,
  softDeleteFile,
  softDeleteFolder,
} from "../../../src/app/api/files/service";
import { MariadbConnection } from "../../../src/lib/db";
import { files, folders, users } from "../../../src/lib/db/schema";
import {
  cleanupTestUserByEmail,
  markTestUserEmailVerified,
} from "./test-user-cleanup";
import type { TestUserCredentials } from "./test-user";
import { resolveUploadFixturePaths } from "./upload-fixtures";

export async function clearBrowserStorage(page: Page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Ignore cleanup failures when there is no active page origin.
  }

  try {
    await page.context().clearCookies();
  } catch {
    // Ignore cleanup failures when the page context is already closed.
  }
}

export async function signUpAndBypassVerification(
  page: Page,
  credentials: TestUserCredentials,
) {
  await cleanupTestUserByEmail(credentials.email);

  await page.goto("/signup");
  await page.getByLabel("Name").fill(credentials.name);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.waitForURL("**/activity");

  await markTestUserEmailVerified(credentials.email);
}

export async function gotoFiles(page: Page) {
  await page.goto("/files");
  await page.reload();
}

export async function gotoTrash(page: Page) {
  await page.getByRole("link", { name: "Trash" }).click();
  await expect(page).toHaveURL(/\/trash$/);
}

export async function ensureUploadDialogOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    return uploadDialog;
  }

  await gotoFiles(page);
  await page.locator(
    '[data-testid="files-library-toolbar"]:visible [data-testid="files-library-toolbar-upload-trigger"]:visible',
  ).click();
  await expect(uploadDialog).toBeVisible();
  return uploadDialog;
}

export async function closeUploadDialogIfOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(uploadDialog).toBeHidden();
  }
}

export async function uploadFiles(page: Page, fileNames: readonly string[]) {
  const uploadDialog = await ensureUploadDialogOpen(page);
  const filePaths = await resolveUploadFixturePaths(fileNames);

  await uploadDialog.locator('input[type="file"]').setInputFiles(filePaths);

  for (const fileName of fileNames) {
    await expect(uploadDialog).toContainText(fileName, { timeout: 120_000 });
  }

  await expect(uploadDialog).toContainText("Done", { timeout: 180_000 });
  await page.keyboard.press("Escape");
  await expect(uploadDialog).toBeHidden();
}

export async function createFolder(page: Page, name: string) {
  await closeUploadDialogIfOpen(page);
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill(name);
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(getGridFolderButton(page, name)).toBeVisible();
}

export function getGridFolderButton(page: Page, folderName: string) {
  return page
    .locator(`[data-testid^="folder-name-"][data-test-folder-name="${folderName}"]`)
    .first();
}

export function getFileNameButton(page: Page, fileName: string) {
  return page
    .locator(`[data-testid^="file-name-"][data-test-file-name="${fileName}"]`)
    .first();
}

export function getTrashItemCard(page: Page, name: string) {
  return page
    .locator(`[data-testid^="trash-item-"][data-test-trash-name="${name}"]`)
    .first();
}

export function getTrashBadge(page: Page) {
  return page.getByTestId("trash-nav-badge").first();
}

export async function openFileActions(page: Page, fileName: string) {
  await page
    .locator(`[data-testid^="file-actions-"][data-test-file-name="${fileName}"]`)
    .first()
    .click();
}

export async function openFolderActions(page: Page, folderName: string) {
  await page
    .locator(`[data-testid^="folder-actions-"][data-test-folder-name="${folderName}"]`)
    .first()
    .click();
}

export async function confirmAlertDialog(
  dialog: Locator,
  confirmLabel: string,
) {
  const confirmButton = dialog.getByRole("button", { exact: true, name: confirmLabel });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
}

export async function getUserIdByEmail(email: string) {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  return result[0]?.id ?? null;
}

export async function getFolderIdForUser(userId: string, name: string) {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.user_id, userId), eq(folders.name, name)))
    .limit(1);

  return result[0]?.id ?? null;
}

export async function getFileIdForUser(userId: string, name: string) {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.user_id, userId), eq(files.name, name)))
    .limit(1);

  return result[0]?.id ?? null;
}

export async function moveFileByNameForUser(
  userId: string,
  fileName: string,
  targetFolderName: string | null,
) {
  await expect
    .poll(async () => {
      const fileId = await getFileIdForUser(userId, fileName);
      const targetFolderId = targetFolderName
        ? await getFolderIdForUser(userId, targetFolderName)
        : null;

      if (!fileId || (targetFolderName && !targetFolderId)) {
        return "ids-missing";
      }

      try {
        await moveFile(userId, fileId, targetFolderId);
        return "ok";
      } catch (error) {
        return error instanceof Error ? error.message : "move-failed";
      }
    })
    .toBe("ok");
}

export async function softDeleteFileByNameForUser(userId: string, fileName: string) {
  await expect
    .poll(async () => {
      const fileId = await getFileIdForUser(userId, fileName);

      if (!fileId) {
        return "missing";
      }

      try {
        await softDeleteFile(userId, fileId);
        return "ok";
      } catch (error) {
        return error instanceof Error ? error.message : "delete-failed";
      }
    })
    .toBe("ok");
}

export async function softDeleteFolderByNameForUser(userId: string, folderName: string) {
  await expect
    .poll(async () => {
      const folderId = await getFolderIdForUser(userId, folderName);

      if (!folderId) {
        return "missing";
      }

      try {
        await softDeleteFolder(userId, folderId);
        return "ok";
      } catch (error) {
        return error instanceof Error ? error.message : "delete-failed";
      }
    })
    .toBe("ok");
}
