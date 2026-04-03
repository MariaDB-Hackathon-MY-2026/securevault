import path from "node:path";

import { and, eq } from "drizzle-orm";
import { expect, test, type Page } from "@playwright/test";

import { moveFolder } from "../../src/app/api/files/service";
import { MariadbConnection } from "../../src/lib/db";
import { folders, users } from "../../src/lib/db/schema";
import {
  cleanupTestUserByEmail,
  markTestUserEmailVerified,
} from "./helpers/test-user-cleanup";
import { buildTestUserCredentials, type TestUserCredentials } from "./helpers/test-user";

const SAMPLE_DIR = path.resolve(process.cwd(), "sample_upload_test_file");

async function clearBrowserStorage(page: Page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Ignore cleanup failures when there is no active page origin.
  }

  await page.context().clearCookies();
}

async function signUpAndBypassVerification(page: Page, credentials: TestUserCredentials) {
  await cleanupTestUserByEmail(credentials.email);

  await page.goto("/signup");
  await page.getByLabel("Name").fill(credentials.name);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.waitForURL("**/activity");

  await markTestUserEmailVerified(credentials.email);
}

async function openUploadDialog(page: Page) {
  await page.goto("/files");
  await page.reload();
  await ensureUploadDialogOpen(page);
}

async function ensureUploadDialogOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole("button", { name: "Upload files" }).click();
  await expect(uploadDialog).toBeVisible();
}

async function closeUploadDialogIfOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(uploadDialog).toBeHidden();
  }
}

async function uploadFiles(page: Page, fileNames: readonly string[]) {
  const filePaths = fileNames.map((fileName) => path.join(SAMPLE_DIR, fileName));

  await ensureUploadDialogOpen(page);
  await page.locator('input[type="file"]').setInputFiles(filePaths);

  for (const fileName of fileNames) {
    await expect(page.getByRole("dialog", { name: "Upload Files" })).toContainText(fileName, {
      timeout: 120_000,
    });
    await expect(page.getByRole("dialog", { name: "Upload Files" })).toContainText("Done", {
      timeout: 180_000,
    });
  }

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Upload Files" })).toBeHidden();
}

async function createFolder(page: Page, name: string) {
  await closeUploadDialogIfOpen(page);
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill(name);
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(getGridFolderButton(page, name)).toBeVisible();
}

async function openFileActions(page: Page, fileName: string) {
  await page.locator(`[data-testid^="file-actions-"][data-test-file-name="${fileName}"]`).first().click();
}

async function openFolderActions(page: Page, folderName: string) {
  await page.locator(`[data-testid^="folder-actions-"][data-test-folder-name="${folderName}"]`).first().click();
}

async function chooseFolderAction(page: Page, folderName: string, actionName: "Delete" | "Move" | "Rename") {
  await openFolderActions(page, folderName);
  await page.getByRole("menuitem", { name: actionName }).click();
}

async function getUserIdByEmail(email: string) {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  return result[0]?.id ?? null;
}

async function getFolderIdForUser(userId: string, name: string) {
  const db = MariadbConnection.getConnection();
  const result = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.user_id, userId),
        eq(folders.name, name),
      ),
    )
    .limit(1);

  return result[0]?.id ?? null;
}

async function moveFolderByNameForUser(
  userId: string,
  folderName: string,
  targetFolderName: string,
) {
  await expect
    .poll(async () => {
      const folderId = await getFolderIdForUser(userId, folderName);
      const targetFolderId = await getFolderIdForUser(userId, targetFolderName);

      if (!folderId || !targetFolderId) {
        return "ids-missing";
      }

      try {
        await moveFolder(userId, folderId, targetFolderId);
        return "ok";
      } catch (error) {
        return error instanceof Error ? error.message : "move-failed";
      }
    })
    .toBe("ok");
}

function getGridFolderButton(page: Page, folderName: string) {
  return page.locator(`[data-testid^="folder-name-"][data-test-folder-name="${folderName}"]`).first();
}

function getBreadcrumbFolderButton(page: Page, folderName: string) {
  return page.locator(`[data-testid^="breadcrumb-folder-"][data-test-folder-name="${folderName}"]`).first();
}

function getFolderDestinationButton(page: Page, folderName: string) {
  return page.getByRole("dialog").locator(`[data-testid^="move-destination-"][data-test-folder-name="${folderName}"]`).first();
}

function getFileNameButton(page: Page, fileName: string) {
  return page.locator(`[data-testid^="file-name-"][data-test-file-name="${fileName}"]`).first();
}

function getFolderRenameInput(page: Page, folderName: string) {
  return page.locator(`[data-testid^="rename-folder-"][data-test-folder-name="${folderName}"]`).first();
}

async function selectMoveDestination(
  dialog: ReturnType<Page["getByRole"]>,
  folderName: string,
) {
  const destinationButton = dialog.getByRole("button", { name: folderName, exact: true });
  await destinationButton.click();
  await expect(destinationButton).toHaveAttribute("data-variant", "default");
}

async function confirmMoveDialog(
  dialog: ReturnType<Page["getByRole"]>,
  confirmLabel: "Move files" | "Move folder",
) {
  const confirmButton = dialog.getByRole("button", { name: confirmLabel, exact: true });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
}

test.describe("file actions", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("creates a folder, renames a file, moves it, and deletes it", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await uploadFiles(page, ["tiny.pdf"]);

    await createFolder(page, "Projects");

    await getFileNameButton(page, "tiny.pdf").click();
    const renameInput = page.getByLabel("Rename file");
    await expect(renameInput).toBeVisible();
    await renameInput.fill("renamed-tiny.pdf");
    await expect(renameInput).toHaveValue("renamed-tiny.pdf");
    await renameInput.press("Enter");

    await expect(getFileNameButton(page, "renamed-tiny.pdf")).toBeVisible();
    await expect(page.getByText("File not found")).toHaveCount(0);

    await openFileActions(page, "renamed-tiny.pdf");
    const moveFileMenuItem = page.getByRole("menuitem", { name: "Move" });
    await moveFileMenuItem.click();
    const moveFileDialog = page.getByRole("dialog", { name: "Move file" });
    await expect(moveFileDialog).toBeVisible();
    await selectMoveDestination(moveFileDialog, "Projects");
    await confirmMoveDialog(moveFileDialog, "Move files");

    await expect(moveFileDialog).toBeHidden();
    await expect(page.getByText("File not found")).toHaveCount(0);
    await expect(getFileNameButton(page, "renamed-tiny.pdf")).toHaveCount(0);

    await getGridFolderButton(page, "Projects").click();
    await expect(getFileNameButton(page, "renamed-tiny.pdf")).toBeVisible();

    await openFileActions(page, "renamed-tiny.pdf");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const deleteFileDialog = page.getByRole("alertdialog").filter({ has: page.getByRole("button", { name: "Delete", exact: true }) });
    await expect(deleteFileDialog).toBeVisible();
    await deleteFileDialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText("File not found")).toHaveCount(0);
    await expect(getFileNameButton(page, "renamed-tiny.pdf")).toHaveCount(0);
  });

  test("bulk moves and bulk deletes selected files", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await uploadFiles(page, ["tiny.pdf", "photo.png"]);

    await createFolder(page, "Bulk Folder");

    await page.getByRole("button", { name: "List" }).click();
    await page.getByLabel("Select tiny.pdf").click();
    await page.getByLabel("Select photo.png").click();
    await page.getByRole("button", { name: "Move", exact: true }).click();
    const moveFilesDialog = page.getByRole("dialog", { name: /Move \d+ files|Move file/ });
    await expect(moveFilesDialog).toBeVisible();
    await selectMoveDestination(moveFilesDialog, "Bulk Folder");
    await confirmMoveDialog(moveFilesDialog, "Move files");

    await expect(moveFilesDialog).toBeHidden();
    await expect(page.getByText("File not found")).toHaveCount(0);
    await expect(page.getByText("tiny.pdf", { exact: true })).toHaveCount(0);
    await expect(page.getByText("photo.png", { exact: true })).toHaveCount(0);

    await getGridFolderButton(page, "Bulk Folder").click();
    await expect(page.getByText("tiny.pdf", { exact: true })).toBeVisible();
    await expect(page.getByText("photo.png", { exact: true })).toBeVisible();

    await page.getByLabel("Select tiny.pdf").click();
    await page.getByLabel("Select photo.png").click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const deleteFilesDialog = page.getByRole("alertdialog").filter({ has: page.getByRole("button", { name: "Delete", exact: true }) });
    await expect(deleteFilesDialog).toBeVisible();
    await deleteFilesDialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText("File not found")).toHaveCount(0);
    await expect(page.getByText("tiny.pdf", { exact: true })).toHaveCount(0);
    await expect(page.getByText("photo.png", { exact: true })).toHaveCount(0);
  });

  test("renames a folder from the grid and updates the breadcrumb", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await page.goto("/files");
    await page.reload();

    await createFolder(page, "Projects");

    await chooseFolderAction(page, "Projects", "Rename");
    const renameInput = getFolderRenameInput(page, "Projects");
    await expect(renameInput).toBeVisible();
    await renameInput.fill("Archives");
    await expect(renameInput).toHaveValue("Archives");
    await page.keyboard.press("Tab");

    await expect(getGridFolderButton(page, "Archives")).toBeVisible();
    await expect(getGridFolderButton(page, "Projects")).toHaveCount(0);

    await getGridFolderButton(page, "Archives").click();
    await expect(page.getByRole("button", { name: "All files" })).toBeVisible();
    await expect(getGridFolderButton(page, "Archives")).toBeVisible();
    await expect(page.getByText("File not found")).toHaveCount(0);
  });

  test("deletes a folder and confirms nested content is removed", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);

    await createFolder(page, "Documents");
    await getGridFolderButton(page, "Documents").click();
    await createFolder(page, "Taxes");
    await getGridFolderButton(page, "Taxes").click();
    await uploadFiles(page, ["tiny.pdf"]);
    await page.getByRole("button", { name: "All files" }).click();
    await openFileActions(page, "tiny.pdf");
    const moveNestedFileMenuItem = page.getByRole("menuitem", { name: "Move" });
    await moveNestedFileMenuItem.click();
    const moveNestedFileDialog = page.getByRole("dialog", { name: "Move file" });
    await expect(moveNestedFileDialog).toBeVisible();
    await selectMoveDestination(moveNestedFileDialog, "Documents");
    await confirmMoveDialog(moveNestedFileDialog, "Move files");
    await expect(moveNestedFileDialog).toBeHidden();

    await chooseFolderAction(page, "Documents", "Delete");
    await expect(page.getByRole("alertdialog", { name: "Delete folder" })).toContainText(
      "This will permanently delete 1 file and 1 sub-folder.",
    );
    await page.getByRole("button", { name: "Delete folder" }).click();

    await expect(getGridFolderButton(page, "Documents")).toHaveCount(0);
    await expect(page.getByText("File not found")).toHaveCount(0);
  });

  test("moves a folder into another folder and verifies the breadcrumb hierarchy", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await page.goto("/files");
    await page.reload();

    await createFolder(page, "Archive");
    await createFolder(page, "Projects");

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();
    await moveFolderByNameForUser(userId!, "Projects", "Archive");
    await page.goto("/files");
    await page.reload();

    await expect(getGridFolderButton(page, "Projects")).toHaveCount(0);

    await getGridFolderButton(page, "Archive").click();
    await expect(getGridFolderButton(page, "Projects")).toBeVisible();
    await getGridFolderButton(page, "Projects").click();
    await expect(page.getByRole("button", { name: "All files" })).toBeVisible();
    await expect(getBreadcrumbFolderButton(page, "Archive")).toBeVisible();
    await expect(getBreadcrumbFolderButton(page, "Projects")).toBeVisible();
  });

  test("resets to root when the currently open folder is deleted", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await page.goto("/files");
    await page.reload();

    await createFolder(page, "Temp");
    await getGridFolderButton(page, "Temp").click();

    await chooseFolderAction(page, "Temp", "Delete");
    await page.getByRole("button", { name: "Delete folder" }).click();

    await expect(page.getByRole("button", { name: "All files" })).toBeVisible();
    await expect(getGridFolderButton(page, "Temp")).toHaveCount(0);
    await expect(page.getByText("File not found")).toHaveCount(0);
  });

  test("cannot move a parent folder into one of its own descendants", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await page.goto("/files");
    await page.reload();

    await createFolder(page, "A");
    await getGridFolderButton(page, "A").click();
    await createFolder(page, "B");
    await page.getByRole("button", { name: "All files" }).click();

    await chooseFolderAction(page, "A", "Move");

    const moveDialog = page.getByRole("dialog", { name: "Move folder" });
    await expect(moveDialog.getByRole("button", { name: "All files (root)" })).toBeVisible();
    await expect(getFolderDestinationButton(page, "B")).toHaveCount(0);

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();

    const folderAId = await getFolderIdForUser(userId!, "A");
    const folderBId = await getFolderIdForUser(userId!, "B");
    expect(folderAId).not.toBeNull();
    expect(folderBId).not.toBeNull();

    await expect(moveFolder(userId!, folderAId!, folderBId!)).rejects.toThrow(
      "Cannot move a folder into itself or one of its descendants",
    );
  });
});
