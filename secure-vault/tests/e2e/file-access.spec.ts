import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test, type Browser, type BrowserContext, type Page } from "./helpers/e2e-test";

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
}

async function ensureUploadDialogOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole("button", { name: "Upload files" }).click();
  await expect(uploadDialog).toBeVisible();
}

async function closeUploadDialog(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });
  await page.keyboard.press("Escape");
  await expect(uploadDialog).toBeHidden();
}

async function setUploadFiles(page: Page, fileNames: readonly string[]) {
  const filePaths = fileNames.map((fileName) => path.join(SAMPLE_DIR, fileName));
  await ensureUploadDialogOpen(page);
  await page.locator('input[type="file"]').setInputFiles(filePaths);
}

async function getFileIdByName(page: Page, fileName: string) {
  const result = await page.evaluate(async (targetName) => {
    const response = await fetch("/api/files", { credentials: "same-origin" });
    const payload = (await response.json()) as {
      files: Array<{ id: string; name: string }>;
    };

    return payload.files.find((file) => file.name === targetName)?.id ?? null;
  }, fileName);

  expect(result).not.toBeNull();
  return result as string;
}

async function sha256Hex(filePath: string) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function downloadFileHash(page: Page, fileId: string) {
  return page.evaluate(async (targetFileId) => {
    const response = await fetch(`/api/files/${targetFileId}/download`, {
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(`Unexpected download status ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }, fileId);
}

async function fetchStatus(page: Page, pathName: string) {
  return page.evaluate(async (targetPath) => {
    const response = await fetch(targetPath, {
      credentials: "same-origin",
    });

    return response.status;
  }, pathName);
}

async function createContextAndPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  return { context, page };
}

test.describe("file access", () => {
  test.afterEach(async ({}, testInfo) => {
    const owner = buildTestUserCredentials(testInfo);
    const otherUserEmail = owner.email.replace("@", "+other@");

    await cleanupTestUserByEmail(owner.email);
    await cleanupTestUserByEmail(otherUserEmail);
  });

  test("downloads a real multi-chunk file with matching checksum", async ({ browser }, testInfo) => {
    const credentials = buildTestUserCredentials(testInfo);
    const { context, page } = await createContextAndPage(browser);

    try {
      await signUpAndBypassVerification(page, credentials);
      await openUploadDialog(page);
      await setUploadFiles(page, ["chunked.pdf"]);

      await expect(page.getByText("chunked.pdf", { exact: true })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Upload Files" })).toContainText("Done", {
        timeout: 180_000,
      });

      await closeUploadDialog(page);

      const fileId = await getFileIdByName(page, "chunked.pdf");
      const downloadedHash = await downloadFileHash(page, fileId);
      const sourceHash = await sha256Hex(path.join(SAMPLE_DIR, "chunked.pdf"));

      expect(downloadedHash).toBe(sourceHash);
    } finally {
      await clearBrowserStorage(page);
      await context.close();
    }
  });

  test("returns 404 for preview and download when a different user requests the file", async ({ browser }, testInfo) => {
    const owner = buildTestUserCredentials(testInfo);
    const otherUser: TestUserCredentials = {
      email: owner.email.replace("@", "+other@"),
      name: owner.name,
      password: owner.password,
    };

    const ownerSession = await createContextAndPage(browser);
    const intruderSession = await createContextAndPage(browser);

    try {
      await signUpAndBypassVerification(ownerSession.page, owner);
      await openUploadDialog(ownerSession.page);
      await setUploadFiles(ownerSession.page, ["tiny.pdf"]);
      await expect(ownerSession.page.getByRole("dialog", { name: "Upload Files" })).toContainText(
        "Done",
        {
          timeout: 120_000,
        },
      );
      await closeUploadDialog(ownerSession.page);

      const fileId = await getFileIdByName(ownerSession.page, "tiny.pdf");

      await signUpAndBypassVerification(intruderSession.page, otherUser);
      await intruderSession.page.goto("/files");

      await expect
        .poll(() => fetchStatus(intruderSession.page, `/api/files/${fileId}/download`))
        .toBe(404);
      await expect
        .poll(() => fetchStatus(intruderSession.page, `/api/files/${fileId}/preview`))
        .toBe(404);
    } finally {
      await clearBrowserStorage(ownerSession.page);
      await clearBrowserStorage(intruderSession.page);
      await ownerSession.context.close();
      await intruderSession.context.close();
    }
  });
});
