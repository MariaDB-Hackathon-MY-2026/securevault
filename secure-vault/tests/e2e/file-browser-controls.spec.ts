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
  }

  await expect(page.getByRole("dialog", { name: "Upload Files" })).toContainText("Done", {
    timeout: 180_000,
  });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Upload Files" })).toBeHidden();
}

async function createFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill(name);
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByText("Folder created")).toBeVisible();
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

async function setFilter(page: Page, value: string) {
  await page.getByLabel("Filter files by name").fill(value);
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

  test("covers grid and list display, search, sorting, and folder creation flows", async ({ page }, testInfo) => {
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

    await setFilter(page, "Alpha");
    await expect(getGridFolderButton(page, "Alpha Folder")).toBeVisible();
    await expect(page.getByRole("button", { name: "tiny.pdf", exact: true })).toHaveCount(0);

    await setFilter(page, "tiny");
    await expect(page.getByRole("button", { name: "tiny.pdf", exact: true })).toBeVisible();
    await expect(getGridFolderButton(page, "Alpha Folder")).toHaveCount(0);

    await setFilter(page, "");

    await expect(page.locator("table")).toHaveCount(0);
    await page.getByRole("button", { name: "List" }).click();
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByLabel("Select tiny.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Grid" }).click();
    await expect(page.locator("table")).toHaveCount(0);
    await page.getByRole("button", { name: "List" }).click();

    await setFilter(page, "pdf");

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
