import { expect, test, type Browser } from "@playwright/test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createFolderFixture,
  createShareLinkFixture,
  getFileIdForUser,
  getUserIdByEmail,
  openFilesPage,
  moveFileFixture,
  signUpAndBypassVerification,
  uploadFiles,
} from "./helpers/share";

async function createVisitorPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  return { context, page };
}

test.describe("share folder", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("navigates inside the shared subtree and blocks escape attempts", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);
    const visitor = await createVisitorPage(browser);

    try {
      await signUpAndBypassVerification(page, credentials);
      await openFilesPage(page);
      await uploadFiles(page, ["tiny.pdf", "photo.png"]);

      const userId = await getUserIdByEmail(credentials.email);
      expect(userId).not.toBeNull();

      const rootFolder = await createFolderFixture(userId!, "Shared Root", null);
      const nestedFolder = await createFolderFixture(userId!, "Nested", rootFolder.id);
      const outsideFolder = await createFolderFixture(userId!, "Private", null);

      const nestedFileId = await getFileIdForUser(userId!, "tiny.pdf");
      const outsideFileId = await getFileIdForUser(userId!, "photo.png");
      expect(nestedFileId).not.toBeNull();
      expect(outsideFileId).not.toBeNull();

      await moveFileFixture(userId!, nestedFileId!, nestedFolder.id);
      await moveFileFixture(userId!, outsideFileId!, outsideFolder.id);

      const link = await createShareLinkFixture({
        allowedEmails: [],
        createdBy: userId!,
        expiresAt: null,
        folderId: rootFolder.id,
        maxDownloads: null,
      });

      await visitor.page.goto(`/s/${link.token}`);
      await expect(visitor.page.getByTestId(`shared-folder-row-${nestedFolder.id}`)).toBeVisible();

      await visitor.page.getByTestId(`shared-folder-row-${nestedFolder.id}`).click();
      await expect(visitor.page.getByTestId(`shared-breadcrumb-${rootFolder.id}`)).toBeVisible();
      await expect(visitor.page.getByTestId(`shared-breadcrumb-${nestedFolder.id}`)).toBeVisible();
      await expect(visitor.page.getByTestId(`shared-file-row-${nestedFileId}`)).toBeVisible();

      await visitor.page.getByTestId(`shared-file-row-${nestedFileId}`).click();
      await expect(visitor.page.getByTestId("shared-file-view")).toBeVisible();
      await visitor.page.getByRole("button", { name: "Back to directory" }).click();
      await expect(visitor.page.getByTestId(`shared-file-row-${nestedFileId}`)).toBeVisible();

      const outsideFolderResponse = await visitor.page.request.get(
        `/api/share/${link.token}/folder?folderId=${outsideFolder.id}`,
      );
      expect(outsideFolderResponse.status()).toBe(404);

      const outsideFileResponse = await visitor.page.request.get(
        `/api/share/${link.token}/download?fileId=${outsideFileId}`,
      );
      expect(outsideFileResponse.status()).toBe(404);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
