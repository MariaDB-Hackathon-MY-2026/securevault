import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

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
  await page.getByRole("button", { name: "Upload files" }).click();
  await expect(page.getByRole("dialog", { name: "Upload Files" })).toBeVisible();
}

async function uploadFiles(page: Page, fileNames: readonly string[]) {
  const filePaths = fileNames.map((fileName) => path.join(SAMPLE_DIR, fileName));

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
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill(name);
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByText("Folder created")).toBeVisible();
  await expect(getGridFolderButton(page, name)).toBeVisible();
}

async function openFileActions(page: Page, fileName: string) {
  await page.getByRole("button", { name: `Open actions for ${fileName}` }).click();
}

function getGridFolderButton(page: Page, folderName: string) {
  return page
    .locator("button")
    .filter({
      has: page.getByText(folderName, { exact: true }),
    })
    .filter({
      has: page.getByText("Open folder", { exact: false }),
    });
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

    await page.getByRole("button", { name: "tiny.pdf", exact: true }).click();
    const renameInput = page.getByLabel("Rename file");
    await renameInput.fill("renamed-tiny.pdf");
    await renameInput.press("Enter");

    await expect(page.getByText("File renamed")).toBeVisible();
    await expect(page.getByRole("button", { name: "renamed-tiny.pdf", exact: true })).toBeVisible();
    await expect(page.getByText("File not found")).toHaveCount(0);

    await openFileActions(page, "renamed-tiny.pdf");
    await page.getByRole("menuitem", { name: "Move" }).click();
    await page.getByRole("button", { name: "Projects" }).click();
    await page.getByRole("button", { name: "Move files" }).click();

    await expect(page.getByText("File moved")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Move file" })).toBeHidden();
    await expect(page.getByText("File not found")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "renamed-tiny.pdf", exact: true })).toHaveCount(0);

    await getGridFolderButton(page, "Projects").click();
    await expect(page.getByRole("button", { name: "renamed-tiny.pdf", exact: true })).toBeVisible();

    await openFileActions(page, "renamed-tiny.pdf");
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("File deleted")).toBeVisible();
    await expect(page.getByText("File not found")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "renamed-tiny.pdf", exact: true })).toHaveCount(0);
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
    await page.getByRole("button", { name: "Move" }).click();
    await page.getByRole("button", { name: "Bulk Folder" }).click();
    await page.getByRole("button", { name: "Move files" }).click();

    await expect(page.getByText("Files moved")).toBeVisible();
    await expect(page.getByText("File not found")).toHaveCount(0);
    await expect(page.getByText("tiny.pdf", { exact: true })).toHaveCount(0);
    await expect(page.getByText("photo.png", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Bulk Folder" }).click();
    await expect(page.getByText("tiny.pdf", { exact: true })).toBeVisible();
    await expect(page.getByText("photo.png", { exact: true })).toBeVisible();

    await page.getByLabel("Select tiny.pdf").click();
    await page.getByLabel("Select photo.png").click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Files deleted")).toBeVisible();
    await expect(page.getByText("File not found")).toHaveCount(0);
    await expect(page.getByText("tiny.pdf", { exact: true })).toHaveCount(0);
    await expect(page.getByText("photo.png", { exact: true })).toHaveCount(0);
  });
});
