import { expect, test, type Browser, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createShareLinkFixture,
  expireShareLinkFixture,
  getFileIdForUser,
  getUserIdByEmail,
  openFilesPage,
  revokeShareLinkFixture,
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

async function requestOtp(page: Page, email: string) {
  await page.getByLabel("Email Address").fill(email);
  await page.getByRole("button", { name: "Send Verification Code" }).click();
  await expect(page.getByLabel("Verification Code")).toBeVisible();
}

async function unlockRestrictedLink(page: Page, link: { id: string; token: string }, email: string) {
  await page.goto(`/s/${link.token}`);
  await requestOtp(page, email);
  await waitForShareOtpRow({ email, linkId: link.id });
  await seedKnownShareOtp({ code: "123456", email, linkId: link.id });
  await page.getByLabel("Verification Code").fill("123456");
  await page.getByRole("button", { name: "Verify and Access" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function fetchPathStatus(page: Page, pathName: string) {
  return page.evaluate(async (targetPath) => {
    const response = await fetch(targetPath, {
      credentials: "same-origin",
    });

    return response.status;
  }, pathName);
}

test.describe("share session invalidation", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("blocks restricted preview and download without a verified session", async ({
    browser,
    page,
  }, testInfo) => {
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
      await expect.poll(() => fetchPathStatus(visitor.page, `/api/share/${link.token}/download`)).toBe(403);
      await expect.poll(() => fetchPathStatus(visitor.page, `/api/share/${link.token}/preview`)).toBe(403);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });

  test("revocation invalidates an already verified restricted session", async ({
    browser,
    page,
  }, testInfo) => {
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

      await unlockRestrictedLink(visitor.page, link, allowedEmail);
      await revokeShareLinkFixture(link.id);

      const shareResponse = await visitor.page.goto(`/s/${link.token}`);
      expect(shareResponse?.status()).toBe(404);
      await expect.poll(() => visitor.page.request.get(`/api/share/${link.token}/download`).then((res) => res.status())).toBe(404);
      await expect.poll(() => visitor.page.request.get(`/api/share/${link.token}/preview`).then((res) => res.status())).toBe(404);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });

  test("expiry invalidates an already verified restricted session", async ({
    browser,
    page,
  }, testInfo) => {
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
        expiresAt: new Date(Date.now() + 60_000),
        fileId: fileId!,
        maxDownloads: null,
      });

      await unlockRestrictedLink(visitor.page, link, allowedEmail);
      await expireShareLinkFixture(link.id);

      await visitor.page.goto(`/s/${link.token}`);
      await expect(visitor.page.getByRole("heading", { name: "Link Expired" })).toBeVisible();
      await expect.poll(() => visitor.page.request.get(`/api/share/${link.token}/download`).then((res) => res.status())).toBe(410);
      await expect.poll(() => visitor.page.request.get(`/api/share/${link.token}/preview`).then((res) => res.status())).toBe(410);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
