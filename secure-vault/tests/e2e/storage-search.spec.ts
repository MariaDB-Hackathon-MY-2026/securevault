import { expect, test, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createFolder,
  getFileNameButton,
  getUserIdByEmail,
  gotoFiles,
  moveFileByNameForUser,
  signUpAndBypassVerification,
  uploadFiles,
} from "./helpers/trash-helpers";

async function openFilenameMode(page: Page) {
  await page.getByRole("button", { name: "Filename" }).click();
  await expect(page.getByRole("button", { name: "Filename" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

test.describe("storage dashboard and filename search", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("renders the storage dashboard zero state for a new user", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await gotoFiles(page);

    await expect(page.getByText("Storage overview")).toBeVisible();
    await expect(page.getByText("Category breakdown")).toBeVisible();
    await expect(page.getByText("Largest files")).toBeVisible();
    await expect(page.getByText("No active files yet. Uploads will appear here once they are ready.")).toBeVisible();
  });

  test("updates dashboard cards after uploads and opens a filename search result back in filter mode", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await gotoFiles(page);
    await uploadFiles(page, ["tiny.pdf", "photo.png"]);

    await expect(page.getByText("tiny.pdf")).toBeVisible();
    await expect(page.getByText("photo.png")).toBeVisible();
    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.getByText("Images")).toBeVisible();

    await createFolder(page, "Projects");

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();
    await moveFileByNameForUser(userId!, "tiny.pdf", "Projects");

    await gotoFiles(page);
    await openFilenameMode(page);
    await page.getByLabel("Search all filenames").fill("tiny");

    await expect(page.getByRole("button", { name: "Open folder" })).toBeVisible();
    await expect(page.getByText("Projects")).toBeVisible();

    await page.getByRole("button", { name: "Open folder" }).click();

    await expect(page.getByRole("button", { name: "Filter" })).toHaveAttribute("aria-pressed", "true");
    await expect(getFileNameButton(page, "tiny.pdf")).toBeVisible();
  });

  test("does not call global filename search for one-character queries", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await gotoFiles(page);

    await openFilenameMode(page);
    await page.getByLabel("Search all filenames").fill("r");

    await expect(page.getByText("Keep typing to search")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open folder" })).toHaveCount(0);
  });
});
