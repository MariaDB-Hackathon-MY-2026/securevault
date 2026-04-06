import { expect, test, type Browser, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createShareLinkFixture,
  getFileIdForUser,
  getLatestShareLinkForTarget,
  getShareLinkUsage,
  getUserIdByEmail,
  openFilesPage,
  signUpAndBypassVerification,
  uploadFiles,
} from "./helpers/share";

async function createVisitorPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  return { context, page };
}

async function fetchSharedDownload(page: Page, token: string) {
  return page.evaluate(async (shareToken) => {
    const response = await fetch(`/api/share/${shareToken}/download`, {
      credentials: "same-origin",
    });

    return {
      body: await response.text(),
      status: response.status,
    };
  }, token);
}

test.describe("share download limits", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("enforces link-wide download limits and reflects them in owner UI", async ({
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
        maxDownloads: 2,
      });

      await visitor.page.goto(`/s/${link.token}`);
      await expect(visitor.page.getByRole("button", { name: "Download" })).toBeVisible();

      const firstDownload = await fetchSharedDownload(visitor.page, link.token);
      expect(firstDownload.status).toBe(200);

      const secondDownload = await fetchSharedDownload(visitor.page, link.token);
      expect(secondDownload.status).toBe(200);

      await expect.poll(async () => (await getShareLinkUsage(link.id))?.downloadCount ?? 0).toBe(2);

      const thirdDownload = await fetchSharedDownload(visitor.page, link.token);
      expect(thirdDownload.status).toBe(403);
      expect(thirdDownload.body).toContain("Download limit reached");

      await page.goto("/files");
      await page.locator(`[data-testid^="file-actions-"][data-test-file-name="tiny.pdf"]`).first().click();
      await page.getByRole("menuitem", { name: "Share" }).click();

      const latestLink = await getLatestShareLinkForTarget({
        fileId: fileId!,
        ownerId: userId!,
      });
      expect(latestLink).not.toBeNull();

      const shareRow = page.getByTestId(`share-link-row-${latestLink!.id}`);
      await expect(shareRow).toContainText("Download limit reached: 2 used of 2");

      await shareRow.getByTestId(`share-link-edit-${latestLink!.id}`).click();
      await page.locator(`#downloads-${latestLink!.id}`).fill("4");
      await shareRow.getByTestId(`share-link-save-${latestLink!.id}`).click();
      await expect(shareRow).toContainText("Downloads used: 2 of 4");

      const fourthDownload = await fetchSharedDownload(visitor.page, link.token);
      expect(fourthDownload.status).toBe(200);
      await expect.poll(async () => (await getShareLinkUsage(link.id))?.downloadCount ?? 0).toBe(3);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
