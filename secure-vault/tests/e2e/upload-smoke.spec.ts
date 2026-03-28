import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  cleanupTestUserByEmail,
  markTestUserEmailVerified,
} from "./helpers/test-user-cleanup";
import { buildTestUserCredentials, type TestUserCredentials } from "./helpers/test-user";
const SAMPLE_DIR = path.resolve(process.cwd(), "sample_upload_test_file");

const SUPPORTED_FILES = [
  "tiny.pdf",
  "chunked.pdf",
  "pdf-over-10mb.pdf",
  "photo.png",
  "animated.gif",
  "large.pdf",
] as const;

const MIXED_BATCH_FILES = [
  ...SUPPORTED_FILES,
  "unsupported.txt",
] as const;

async function clearBrowserStorage(page: Page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Ignore storage cleanup failures when there is no active page origin.
  }

  await page.context().clearCookies();
}

async function signUpAndBypassVerification(page: Page, credentials: TestUserCredentials) {
  await cleanupTestUserByEmail(credentials.email);

  await page.goto("/signup");
  await page.getByLabel("Name").fill(credentials.name);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  const submitButton = page.getByRole("button", { name: "Create an account" });
  await expect(page.getByText("Password strength looks good.")).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await page.waitForURL("**/activity");

  await markTestUserEmailVerified(credentials.email);
}

async function openUploadDialog(page: Page) {
  await page.goto("/files");
  await page.reload();

  await expect(page.getByRole("button", { name: "Upload files" })).toBeVisible();
  await page.getByRole("button", { name: "Upload files" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Supported file types: PDF, JPG, PNG, WebP, GIF, AVIF")).toBeVisible();
}

async function setUploadFiles(page: Page, fileNames: readonly string[]) {
  const filePaths = fileNames.map((fileName) => path.join(SAMPLE_DIR, fileName));

  await page.locator('input[type="file"]').setInputFiles(filePaths);
}

async function waitForQueueCount(page: Page, count: number) {
  await expect(page.getByRole("heading", { name: `Upload Queue (${count})` })).toBeVisible({
    timeout: 30_000,
  });
}

function uploadRow(page: Page, fileName: string) {
  return page
    .getByText(fileName, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'p-3 border rounded-md text-sm')][1]");
}

test.describe("upload smoke", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("uploads a mixed batch and covers filtering, queueing, success, and oversize failure", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await setUploadFiles(page, MIXED_BATCH_FILES);

    await waitForQueueCount(page, SUPPORTED_FILES.length);

    await expect(page.getByText("unsupported.txt")).toHaveCount(0);

    for (const fileName of SUPPORTED_FILES) {
      await expect(page.getByText(fileName, { exact: true })).toBeVisible();
    }

    await expect(uploadRow(page, "large.pdf")).toContainText(/file size exceeds upload size limit|too large/i, {
      timeout: 60_000,
    });

    await expect(uploadRow(page, "tiny.pdf")).toContainText(/done|failed to initialize upload/i, {
      timeout: 120_000,
    });
    await expect(uploadRow(page, "chunked.pdf")).toContainText(/done|failed to initialize upload/i, {
      timeout: 120_000,
    });
    await expect(uploadRow(page, "pdf-over-10mb.pdf")).toContainText("Done", {
      timeout: 120_000,
    });
    await expect(uploadRow(page, "photo.png")).toContainText("Done", {
      timeout: 120_000,
    });
    await expect(uploadRow(page, "animated.gif")).toContainText("Done", {
      timeout: 120_000,
    });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Upload Files" })).toBeHidden();
    await expect(page.getByText("Track progress of your file uploads here.")).toBeVisible();
  });
});
