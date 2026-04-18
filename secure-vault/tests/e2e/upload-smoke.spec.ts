import { expect, test, type Page } from "./helpers/e2e-test";
import {
  getFileIdByName,
  waitForSemanticJobStatus,
} from "./helpers/semantic-helpers";

import {
  cleanupTestUserByEmail,
  markTestUserEmailVerified,
} from "./helpers/test-user-cleanup";
import { buildTestUserCredentials, type TestUserCredentials } from "./helpers/test-user";
import { resolveUploadFixturePaths } from "./helpers/upload-fixtures";

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
  await ensureUploadDialogOpen(page);
  await expect(page.getByText("Supported file types: PDF, JPG, PNG, WebP, GIF, AVIF")).toBeVisible();
}

async function ensureUploadDialogOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    return;
  }

  const uploadTrigger = page.locator(
    '[data-testid="files-library-toolbar"]:visible [data-testid="files-library-toolbar-upload-trigger"]:visible',
  );
  await expect(uploadTrigger).toBeVisible();
  await uploadTrigger.click();
  await expect(uploadDialog).toBeVisible();
}

async function closeUploadDialog(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });
  await page.keyboard.press("Escape");
  await expect(uploadDialog).toBeHidden();
}

async function setUploadFiles(page: Page, fileNames: readonly string[]) {
  const filePaths = await resolveUploadFixturePaths(fileNames);

  await ensureUploadDialogOpen(page);
  await page.locator('input[type="file"]').setInputFiles(filePaths);
}

async function waitForQueueCount(page: Page, count: number) {
  await expect(page.getByRole("heading", { name: `Upload Queue (${count})` })).toBeVisible({
    timeout: 30_000,
  });
}

function uploadRow(page: Page, fileName: string) {
  return page.locator(`[data-testid^="upload-row-"][data-test-file-name="${fileName}"]`).first();
}

function libraryRow(page: Page, fileName: string) {
  return page.locator(`[data-testid^="file-card-"][data-test-file-name="${fileName}"]`).first();
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

    await closeUploadDialog(page);
    await expect(page.getByText("Track progress of your file uploads here.")).toBeVisible();

    const pdfRow = libraryRow(page, "tiny.pdf");
    await expect(pdfRow).toBeVisible({ timeout: 30_000 });
    const pdfPreviewResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "GET" &&
        response.url().includes("/api/files/") &&
        response.url().endsWith("/preview") &&
        response.ok() &&
        response.headers()["content-type"]?.includes("application/pdf")
      );
    });
    await pdfRow.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog", { name: "tiny.pdf" })).toBeVisible();
    const pdfPreviewFrame = page.locator('iframe[title="Preview of tiny.pdf"]');
    await expect(pdfPreviewFrame).toBeVisible();
    await expect(pdfPreviewFrame).toHaveAttribute("src", /\/api\/files\/.+\/preview$/);
    await pdfPreviewResponsePromise;
    await page.getByRole("button", { name: "Close preview" }).click();
    await expect(page.getByRole("dialog", { name: "tiny.pdf" })).toBeHidden();

    const imageRow = libraryRow(page, "photo.png");
    await expect(imageRow).toBeVisible({ timeout: 30_000 });
    const imagePreviewResponsePromise = page.waitForResponse((response) => {
      return (
        response.request().method() === "GET" &&
        response.url().includes("/api/files/") &&
        response.url().endsWith("/preview") &&
        response.ok() &&
        response.headers()["content-type"]?.includes("image/png")
      );
    });
    await imageRow.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog", { name: "photo.png" })).toBeVisible();
    await expect(page.getByAltText("photo.png")).toBeVisible();
    await imagePreviewResponsePromise;
    await page.getByRole("button", { name: "Close preview" }).click();
    await expect(page.getByRole("dialog", { name: "photo.png" })).toBeHidden();
  });

  test("shows semantic indexing progressing independently after a successful PDF upload", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await setUploadFiles(page, ["tiny.pdf"]);

    const row = uploadRow(page, "tiny.pdf");
    await expect(row).toContainText("Done", { timeout: 120_000 });
    await expect(row).toContainText(/Semantic indexing (queued|processing|ready)/i, {
      timeout: 30_000,
    });

    const fileId = await getFileIdByName(page, "tiny.pdf");
    await waitForSemanticJobStatus({
      expectedStatus: "ready",
      fileId,
      modality: "pdf",
      page,
    });

    await expect(row).toContainText("Semantic indexing ready", { timeout: 30_000 });
  });

  test("keeps upload success and file preview working when semantic indexing cannot be triggered", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await page.route("**/api/embeddings", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      await route.fulfill({
        body: JSON.stringify({
          errorCode: "SEMANTIC_INDEXING_UNAVAILABLE",
          message: "Semantic indexing is unavailable.",
          retryable: true,
        }),
        contentType: "application/json",
        status: 503,
      });
    });

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await setUploadFiles(page, ["tiny.pdf"]);

    const row = uploadRow(page, "tiny.pdf");
    await expect(row).toContainText("Done", { timeout: 120_000 });
    await expect(row).toContainText("Semantic indexing is unavailable.", {
      timeout: 30_000,
    });

    await closeUploadDialog(page);

    const pdfRow = libraryRow(page, "tiny.pdf");
    await expect(pdfRow).toBeVisible({ timeout: 30_000 });
    await pdfRow.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog", { name: "tiny.pdf" })).toBeVisible();
    await expect(page.locator('iframe[title="Preview of tiny.pdf"]')).toBeVisible();
  });
});
