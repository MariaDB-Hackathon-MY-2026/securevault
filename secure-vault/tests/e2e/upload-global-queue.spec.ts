import { expect, test, type Page } from "./helpers/e2e-test";

import {
  cleanupTestUserByEmail,
  markTestUserEmailVerified,
} from "./helpers/test-user-cleanup";
import { buildTestUserCredentials, type TestUserCredentials } from "./helpers/test-user";

const TEST_FILE = {
  buffer: Buffer.from("%PDF-1.4 waiting-for-slot"),
  mimeType: "application/pdf",
  name: "waiting-slot.pdf",
} as const;

async function clearBrowserStorage(page: Page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Ignore cleanup failures before the app origin is active.
  }

  await page.context().clearCookies();
}

async function signUpAndBypassVerification(page: Page, credentials: TestUserCredentials) {
  await cleanupTestUserByEmail(credentials.email);

  await page.goto("/signup");
  await page.getByLabel("Name").fill(credentials.name);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);

  await expect(page.getByText("Password strength looks good.")).toBeVisible();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.waitForURL("**/activity");

  await markTestUserEmailVerified(credentials.email);
}

async function openUploadDialog(page: Page) {
  await page.goto("/files");
  await page.reload();
  await page.locator(
    '[data-testid="files-library-toolbar"]:visible [data-testid="files-library-toolbar-upload-trigger"]:visible',
  ).click();
  await expect(page.getByRole("dialog", { name: "Upload Files" })).toBeVisible();
}

function uploadRow(page: Page, fileName: string) {
  return page.locator(`[data-testid^="upload-row-"][data-test-file-name="${fileName}"]`).first();
}

test.describe("upload global queue", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("waits for a global slot and then resumes automatically without a reload", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);

    const credentials = buildTestUserCredentials(testInfo);
    let startAttempts = 0;
    let chunkRequests = 0;

    await page.route("**/api/upload/init", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          fileId: "file-1",
          totalChunks: 1,
          uploadId: "upload-1",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/status?*", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          completedChunkIndexes: [],
          fileId: "file-1",
          status: "uploading",
          totalChunks: 1,
          uploadId: "upload-1",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/start", async (route) => {
      startAttempts += 1;

      if (startAttempts === 1) {
        await route.fulfill({
          body: JSON.stringify({
            message: "Maximum active uploads reached. Waiting for a slot.",
            retryAfterSeconds: 1,
          }),
          contentType: "application/json",
          headers: { "Retry-After": "1" },
          status: 429,
        });
        return;
      }

      await route.fulfill({
        body: JSON.stringify({
          activeCount: 1,
          maxActiveUploads: 3,
          uploadId: "upload-1",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/chunk", async (route) => {
      chunkRequests += 1;

      await route.fulfill({
        body: JSON.stringify({
          chunkIndex: 0,
          status: "uploaded",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/complete", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          fileId: "file-1",
          status: "ready",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/release", async (route) => {
      await route.fulfill({
        body: JSON.stringify({ released: true, uploadId: "upload-1" }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/embeddings", async (route) => {
      await route.fulfill({ status: 204 });
    });

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await page.locator('input[type="file"]').setInputFiles(TEST_FILE);

    await expect(uploadRow(page, TEST_FILE.name)).toContainText("Waiting for slot", {
      timeout: 30_000,
    });
    await expect(uploadRow(page, TEST_FILE.name)).toContainText("Waiting for an upload slot");
    await expect(uploadRow(page, TEST_FILE.name)).toContainText("Done", {
      timeout: 30_000,
    });
    expect(startAttempts).toBe(2);
    expect(chunkRequests).toBe(1);
  });

  test("can cancel cleanly while waiting for a global slot", async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    const credentials = buildTestUserCredentials(testInfo);
    let startAttempts = 0;
    let chunkRequests = 0;
    let completeRequests = 0;
    let releaseRequests = 0;

    await page.route("**/api/upload/init", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          fileId: "file-2",
          totalChunks: 1,
          uploadId: "upload-2",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/status?*", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          completedChunkIndexes: [],
          fileId: "file-2",
          status: "uploading",
          totalChunks: 1,
          uploadId: "upload-2",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/start", async (route) => {
      startAttempts += 1;

      await route.fulfill({
        body: JSON.stringify({
          message: "Maximum active uploads reached. Waiting for a slot.",
          retryAfterSeconds: 1,
        }),
        contentType: "application/json",
        headers: { "Retry-After": "1" },
        status: 429,
      });
    });

    await page.route("**/api/upload/chunk", async (route) => {
      chunkRequests += 1;
      await route.fulfill({
        body: JSON.stringify({
          chunkIndex: 0,
          status: "uploaded",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/complete", async (route) => {
      completeRequests += 1;
      await route.fulfill({
        body: JSON.stringify({
          fileId: "file-2",
          status: "ready",
        }),
        contentType: "application/json",
      });
    });

    await page.route("**/api/upload/release", async (route) => {
      releaseRequests += 1;
      await route.fulfill({
        body: JSON.stringify({ released: true, uploadId: "upload-2" }),
        contentType: "application/json",
      });
    });

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await page.locator('input[type="file"]').setInputFiles(TEST_FILE);

    const row = uploadRow(page, TEST_FILE.name);

    await expect(row).toContainText("Waiting for slot", { timeout: 30_000 });
    await page.getByRole("button", { name: `Cancel upload ${TEST_FILE.name}` }).click();
    await expect(row).toContainText("cancelled", { timeout: 30_000 });
    await page.waitForTimeout(1_500);

    expect(startAttempts).toBe(1);
    expect(chunkRequests).toBe(0);
    expect(completeRequests).toBe(0);
    expect(releaseRequests).toBe(0);
  });
});
