import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  cleanupTestUserByEmail,
  markTestUserEmailVerified,
} from "./helpers/test-user-cleanup";
import { buildTestUserCredentials, type TestUserCredentials } from "./helpers/test-user";

const SAMPLE_DIR = path.resolve(process.cwd(), "sample_upload_test_file");

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

async function ensureUploadDialogOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    return;
  }

  await page.goto("/files");
  await page.reload();
  await page.getByRole("button", { name: "Upload files" }).click();
  await expect(uploadDialog).toBeVisible();
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
  await page.goto("/files");
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill(name);
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("button", { name })).toBeVisible();
}

async function openFileActions(page: Page, fileName: string) {
  await page.locator(`[data-testid^="file-actions-"][data-test-file-name="${fileName}"]`).first().click();
}

async function openFolderActions(page: Page, folderName: string) {
  await page.locator(`[data-testid^="folder-actions-"][data-test-folder-name="${folderName}"]`).first().click();
}

test.describe("trash flows", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await page.context().clearCookies();
    await cleanupTestUserByEmail(email);
  });

  test("deletes and restores a standalone file through trash", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await uploadFiles(page, ["tiny.pdf"]);

    await openFileActions(page, "tiny.pdf");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByRole("button", { name: "tiny.pdf" })).toHaveCount(0);
    await page.getByRole("link", { name: "Trash" }).click();
    await expect(page).toHaveURL(/\/trash$/);
    await expect(page.getByText("tiny.pdf")).toBeVisible();

    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("tiny.pdf")).toHaveCount(0);

    await page.getByRole("link", { name: "Files" }).click();
    await expect(page.getByRole("button", { name: "tiny.pdf" })).toBeVisible();
  });

  test("shows a deleted folder subtree once in trash instead of listing descendants separately", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await createFolder(page, "Projects");
    await page.getByRole("button", { name: "Projects" }).click();
    await createFolder(page, "Taxes");
    await uploadFiles(page, ["tiny.pdf"]);

    await page.getByRole("button", { name: "All files" }).click();
    await openFolderActions(page, "Projects");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete folder" }).click();

    await page.getByRole("link", { name: "Trash" }).click();
    await expect(page.getByText("Projects")).toBeVisible();
    await expect(page.getByText("tiny.pdf")).toHaveCount(0);
    await expect(page.getByText("1 file and 1 folder in this deleted subtree")).toBeVisible();
  });
});
