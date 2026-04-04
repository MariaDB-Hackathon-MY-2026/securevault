import { expect, test, type Browser } from "@playwright/test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createShareLinkFixture,
  getFileIdForUser,
  getShareAccessLogCount,
  getShareLinkUsage,
  getUserIdByEmail,
  openFilesPage,
  seedKnownShareOtp,
  signUpAndBypassVerification,
  uploadFiles,
  waitForShareOtpRow,
} from "./helpers/share";

async function createVisitorPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  return { context, page };
}

test.describe("share access logging", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("records restricted unlocks and successful downloads", async ({ browser, page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);
    const visitor = await createVisitorPage(browser);
    const allowedEmail = "reader@example.com";

    try {
      await signUpAndBypassVerification(page, credentials);
      await openFilesPage(page);
      await uploadFiles(page, ["tiny.pdf"]);

      const userId = await getUserIdByEmail(credentials.email);
      expect(userId).not.toBeNull();
      const fileId = await getFileIdForUser(userId!, "tiny.pdf");
      expect(fileId).not.toBeNull();

      const link = await createShareLinkFixture({
        allowedEmails: [allowedEmail],
        createdBy: userId!,
        expiresAt: null,
        fileId: fileId!,
        maxDownloads: null,
      });

      await visitor.page.goto(`/s/${link.token}`);
      await visitor.page.getByLabel("Email Address").fill(allowedEmail);
      await visitor.page.getByRole("button", { name: "Send Verification Code" }).click();
      await expect(visitor.page.getByLabel("Verification Code")).toBeVisible();

      await waitForShareOtpRow({ email: allowedEmail, linkId: link.id });
      await seedKnownShareOtp({ code: "123456", email: allowedEmail, linkId: link.id });

      await visitor.page.getByLabel("Verification Code").fill("123456");
      await visitor.page.getByRole("button", { name: "Verify and Access" }).click();
      await expect(visitor.page.getByText(`Verified as ${allowedEmail}`)).toBeVisible();

      await expect.poll(() => getShareAccessLogCount(link.id, allowedEmail)).toBeGreaterThan(0);

      const downloadResult = await visitor.page.evaluate(async (href) => {
        const response = await fetch(href, { credentials: "same-origin" });
        const buffer = await response.arrayBuffer();

        return {
          byteLength: buffer.byteLength,
          status: response.status,
        };
      }, `/api/share/${link.token}/download`);

      expect(downloadResult.status).toBe(200);
      expect(downloadResult.byteLength).toBeGreaterThan(0);

      await expect.poll(async () => (await getShareLinkUsage(link.id))?.downloadCount ?? 0).toBe(1);
      await expect.poll(async () => getShareAccessLogCount(link.id)).toBeGreaterThan(1);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
