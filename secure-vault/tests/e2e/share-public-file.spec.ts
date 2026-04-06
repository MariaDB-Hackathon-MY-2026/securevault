import { expect, test, type Browser } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createShareLinkFixture,
  expireShareLinkFixture,
  getFileIdForUser,
  getShareLinkUsage,
  getUserIdByEmail,
  openFilesPage,
  revokeShareLinkFixture,
  signUpAndBypassVerification,
  uploadFiles,
} from "./helpers/share";

async function createVisitorPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  return { context, page };
}

test.describe("share public file", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("renders a public shared image and serves a real download", async ({ browser, page }, testInfo) => {
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
      await expect(visitor.page.getByTestId("shared-file-view")).toBeVisible();
      await expect(visitor.page.getByRole("button", { name: "Download" })).toBeVisible();
      await expect(visitor.page.getByTestId("shared-preview-image")).toBeVisible();
      await expect(visitor.page.getByLabel("Email Address")).toHaveCount(0);

      const downloadResult = await visitor.page.evaluate(async (href) => {
        const response = await fetch(href, { credentials: "same-origin" });
        const buffer = await response.arrayBuffer();

        return {
          byteLength: buffer.byteLength,
          ok: response.ok,
          status: response.status,
        };
      }, `/api/share/${link.token}/download`);

      expect(downloadResult.ok).toBe(true);
      expect(downloadResult.status).toBe(200);
      expect(downloadResult.byteLength).toBeGreaterThan(0);

      await expect.poll(async () => (await getShareLinkUsage(link.id))?.downloadCount ?? 0).toBe(1);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });

  test("returns 404 for revoked links and shows expired state for expired links", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);
    const revokedVisitor = await createVisitorPage(browser);
    const expiredVisitor = await createVisitorPage(browser);

    try {
      await signUpAndBypassVerification(page, credentials);
      await openFilesPage(page);
      await uploadFiles(page, ["tiny.pdf"]);

      const userId = await getUserIdByEmail(credentials.email);
      expect(userId).not.toBeNull();
      const fileId = await getFileIdForUser(userId!, "tiny.pdf");
      expect(fileId).not.toBeNull();

      const revokedLink = await createShareLinkFixture({
        allowedEmails: [],
        createdBy: userId!,
        expiresAt: null,
        fileId: fileId!,
        maxDownloads: null,
      });
      await revokeShareLinkFixture(revokedLink.id);

      const revokedResponse = await revokedVisitor.page.goto(`/s/${revokedLink.token}`);
      expect(revokedResponse?.status()).toBe(404);

      const expiredLink = await createShareLinkFixture({
        allowedEmails: [],
        createdBy: userId!,
        expiresAt: new Date(Date.now() + 60_000),
        fileId: fileId!,
        maxDownloads: null,
      });
      await expireShareLinkFixture(expiredLink.id);

      await expiredVisitor.page.goto(`/s/${expiredLink.token}`);
      await expect(expiredVisitor.page.getByRole("heading", { name: "Link Expired" })).toBeVisible();
    } finally {
      await clearBrowserStorage(revokedVisitor.page);
      await clearBrowserStorage(expiredVisitor.page);
      await revokedVisitor.context.close();
      await expiredVisitor.context.close();
    }
  });
});
