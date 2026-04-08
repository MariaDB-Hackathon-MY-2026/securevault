import path from "node:path";

import { expect, test, type Page } from "./helpers/e2e-test";

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

  await page.locator(
    '[data-testid="files-library-toolbar"]:visible [data-testid="files-library-toolbar-upload-trigger"]:visible',
  ).click();
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
  }

  await expect(page.getByRole("dialog", { name: "Upload Files" })).toContainText("Done", {
    timeout: 180_000,
  });

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

function getGridFolderButton(page: Page, folderName: string) {
  return page.locator(`[data-testid^="folder-name-"][data-test-folder-name="${folderName}"]`).first();
}

function getSearchResultName(page: Page, fileName: string) {
  return page
    .locator(
      `[data-testid^="file-search-result-name-"][data-test-file-name="${fileName}"]`,
    )
    .first();
}

function getSearchInput(page: Page) {
  return page.locator(
    '[data-testid="files-library-toolbar"]:visible [data-testid="files-library-toolbar-search-input"]:visible',
  );
}

async function setSearch(page: Page, value: string) {
  await getSearchInput(page).fill(value);
}

async function setSort(page: Page, label: string) {
  await page.getByRole("button", { name: /^Sort:/ }).click();
  await page.getByRole("menuitem", { name: label }).click();
}

async function getVisibleFileOrder(page: Page) {
  const labels = await page
    .locator('tbody input[type="checkbox"][aria-label^="Select "]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")?.replace(/^Select /, "") ?? ""),
    );

  return labels;
}

test.describe("file browser controls", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("covers grid and list display, filename search, sorting, and folder creation flows", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);

    await openUploadDialog(page);
    await uploadFiles(page, ["tiny.pdf"]);

    await openUploadDialog(page);
    await uploadFiles(page, ["chunked.pdf"]);

    await createFolder(page, "Alpha Folder");
    await expect(getGridFolderButton(page, "Alpha Folder")).toBeVisible();

    await getGridFolderButton(page, "Alpha Folder").click();
    await createFolder(page, "Nested Folder");
    await expect(getGridFolderButton(page, "Nested Folder")).toBeVisible();

    await page.getByRole("button", { name: "All files" }).click();
    await expect(getGridFolderButton(page, "Alpha Folder")).toBeVisible();

    const searchResponse = page.waitForResponse((response) =>
      response.url().includes("/api/search/files?q=tiny") && response.ok(),
    );
    await setSearch(page, "tiny");
    await searchResponse;
    await expect(getSearchResultName(page, "tiny.pdf")).toBeVisible();
    await expect(getGridFolderButton(page, "Alpha Folder")).toHaveCount(0);

    await setSearch(page, "");

    await expect(page.locator("table")).toHaveCount(0);
    await page.getByRole("button", { name: "List" }).click();
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByLabel("Select tiny.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Grid" }).click();
    await expect(page.locator("table")).toHaveCount(0);
    await page.getByRole("button", { name: "List" }).click();

    await setSort(page, "Name (A-Z)");
    await expect.poll(() => getVisibleFileOrder(page)).toEqual(["chunked.pdf", "tiny.pdf"]);

    await setSort(page, "Name (Z-A)");
    await expect.poll(() => getVisibleFileOrder(page)).toEqual(["tiny.pdf", "chunked.pdf"]);

    await setSort(page, "Size (largest)");
    await expect.poll(() => getVisibleFileOrder(page)).toEqual(["chunked.pdf", "tiny.pdf"]);

    await setSort(page, "Size (smallest)");
    await expect.poll(() => getVisibleFileOrder(page)).toEqual(["tiny.pdf", "chunked.pdf"]);

    await setSort(page, "Modified (newest)");
    await expect.poll(() => getVisibleFileOrder(page)).toEqual(["chunked.pdf", "tiny.pdf"]);

    await setSort(page, "Modified (oldest)");
    await expect.poll(() => getVisibleFileOrder(page)).toEqual(["tiny.pdf", "chunked.pdf"]);
  });
});
