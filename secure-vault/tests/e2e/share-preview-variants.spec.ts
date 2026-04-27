import { expect, test, type Browser } from "./helpers/e2e-test";

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

test.describe("share preview variants", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("renders the direct public image share with the image preview path", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);
    const visitor = await createVisitorPage(browser);

    try {
      await signUpAndBypassVerification(page, credentials);
      await openFilesPage(page);
      await uploadFiles(page, ["photo.png"]);

      const userId = await getUserIdByEmail(credentials.email);
      expect(userId).not.toBeNull();
      const fileId = await getFileIdForUser(userId!, "photo.png");
      expect(fileId).not.toBeNull();

      const link = await createShareLinkFixture({
        allowedEmails: [],
        createdBy: userId!,
        expiresAt: null,
        fileId: fileId!,
        maxDownloads: null,
      });

      await visitor.page.goto(`/s/${link.token}`);
      await expect(visitor.page.getByTestId("shared-preview-image")).toBeVisible();
      await expect(visitor.page.getByTestId("shared-preview-frame")).toHaveCount(0);
      await expect(visitor.page.getByLabel("Email Address")).toHaveCount(0);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });

  test("renders the direct public pdf share with the secure image preview path", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);
    const visitor = await createVisitorPage(browser);

    try {
      await signUpAndBypassVerification(page, credentials);
      await openFilesPage(page);
      await uploadFiles(page, ["tiny.pdf"]);

      const userId = await getUserIdByEmail(credentials.email);
      expect(userId).not.toBeNull();
      const fileId = await getFileIdForUser(userId!, "tiny.pdf");
      expect(fileId).not.toBeNull();

      const link = await createShareLinkFixture({
        allowedEmails: [],
        createdBy: userId!,
        expiresAt: null,
        fileId: fileId!,
        maxDownloads: null,
      });

      const manifestResponsePromise = visitor.page.waitForResponse(
        (response) =>
          response.url().includes(`/api/share/${link.token}/pdf-preview`)
          && !response.url().includes("/pages/"),
      );
      const pageImageResponsePromise = visitor.page.waitForResponse(
        (response) =>
          response.url().includes(`/api/share/${link.token}/pdf-preview/pages/1`),
      );

      await visitor.page.goto(`/s/${link.token}`);
      await expect(visitor.page.getByTestId("shared-preview-frame")).toHaveCount(0);
      await expect(visitor.page.getByTestId("shared-pdf-preview-page-image-1")).toBeVisible();
      await expect(visitor.page.getByLabel("Email Address")).toHaveCount(0);
      const manifestResponse = await manifestResponsePromise;
      const pageImageResponse = await pageImageResponsePromise;
      expect(manifestResponse.headers()["content-type"]).toContain("application/json");
      expect(pageImageResponse.headers()["content-type"]).toContain("image/webp");
      expect(pageImageResponse.headers()["content-type"]).not.toContain("application/pdf");
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });

  test("supports breadcrumb navigation back to the shared root", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);
    const visitor = await createVisitorPage(browser);

    try {
      await signUpAndBypassVerification(page, credentials);
      await openFilesPage(page);
      await uploadFiles(page, ["tiny.pdf"]);

      const userId = await getUserIdByEmail(credentials.email);
      expect(userId).not.toBeNull();

      const rootFolder = await createFolderFixture(userId!, "Shared Root", null);
      const childFolder = await createFolderFixture(userId!, "Child", rootFolder.id);
      const grandchildFolder = await createFolderFixture(userId!, "Grandchild", childFolder.id);

      const fileId = await getFileIdForUser(userId!, "tiny.pdf");
      expect(fileId).not.toBeNull();
      await moveFileFixture(userId!, fileId!, grandchildFolder.id);

      const link = await createShareLinkFixture({
        allowedEmails: [],
        createdBy: userId!,
        expiresAt: null,
        folderId: rootFolder.id,
        maxDownloads: null,
      });

      await visitor.page.goto(`/s/${link.token}`);
      await expect(visitor.page.getByTestId(`shared-folder-row-${childFolder.id}`)).toBeVisible();

      await visitor.page.getByTestId(`shared-folder-row-${childFolder.id}`).click();
      await expect(visitor.page.getByTestId(`shared-folder-row-${grandchildFolder.id}`)).toBeVisible();
      await expect(visitor.page.getByTestId(`shared-breadcrumb-${childFolder.id}`)).toBeVisible();

      await visitor.page.getByTestId(`shared-folder-row-${grandchildFolder.id}`).click();
      await expect(visitor.page.getByTestId(`shared-file-row-${fileId}`)).toBeVisible();
      await expect(visitor.page.getByTestId(`shared-breadcrumb-${grandchildFolder.id}`)).toBeVisible();

      await visitor.page.getByTestId(`shared-breadcrumb-${rootFolder.id}`).click();
      await expect(visitor.page.getByTestId(`shared-folder-row-${childFolder.id}`)).toBeVisible();
      await expect(visitor.page.getByTestId(`shared-folder-row-${grandchildFolder.id}`)).toHaveCount(0);
      await expect(visitor.page.getByTestId(`shared-file-row-${fileId}`)).toHaveCount(0);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
