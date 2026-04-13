import { expect, test, type Browser, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createShareLinkFixture,
  getFileIdForUser,
  getLatestShareOtpRow,
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

async function requestOtp(page: Page, email: string) {
  await page.getByLabel("Email Address").fill(email);
  await page.getByRole("button", { name: "Send Verification Code" }).click();
  await expect(page.getByLabel("Verification Code")).toBeVisible();
}

test.describe("share restricted file", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("unlocks with multiple allowlisted emails and supports sign out", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);
    const visitorA = await createVisitorPage(browser);
    const visitorB = await createVisitorPage(browser);
    const allowedEmailA = "reader.one@example.com";
    const allowedEmailB = "reader.two@example.com";

    try {
      await signUpAndBypassVerification(page, credentials);
      await openFilesPage(page);
      await uploadFiles(page, ["tiny.pdf"]);

      const userId = await getUserIdByEmail(credentials.email);
      expect(userId).not.toBeNull();
      const fileId = await getFileIdForUser(userId!, "tiny.pdf");
      expect(fileId).not.toBeNull();

      const link = await createShareLinkFixture({
        allowedEmails: [allowedEmailA, allowedEmailB],
        createdBy: userId!,
        expiresAt: null,
        fileId: fileId!,
        maxDownloads: null,
      });

      await visitorA.page.goto(`/s/${link.token}`);
      await expect(visitorA.page.getByLabel("Email Address")).toBeVisible();
      await requestOtp(visitorA.page, allowedEmailA);
      await waitForShareOtpRow({ email: allowedEmailA, linkId: link.id });
      await seedKnownShareOtp({
        code: "123456",
        email: allowedEmailA,
        linkId: link.id,
      });
      await visitorA.page.getByLabel("Verification Code").fill("123456");
      await visitorA.page.getByRole("button", { name: "Verify and Access" }).click();
      await expect(visitorA.page.getByText(`Verified as ${allowedEmailA}`)).toBeVisible();
      await expect(visitorA.page.getByRole("button", { name: "Sign out" })).toBeVisible();
      await expect(visitorA.page.getByRole("button", { name: "Download" })).toBeVisible();

      await visitorA.page.getByRole("button", { name: "Sign out" }).click();
      await expect(visitorA.page.getByLabel("Email Address")).toBeVisible({ timeout: 10_000 });
      await expect(visitorA.page.getByRole("button", { name: "Verify and Access" })).toHaveCount(0);
      await expect(visitorA.page.getByText(`Verified as ${allowedEmailA}`)).toHaveCount(0);
      await expect(visitorA.page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

      await visitorB.page.goto(`/s/${link.token}`);
      await requestOtp(visitorB.page, allowedEmailB);
      await waitForShareOtpRow({ email: allowedEmailB, linkId: link.id });
      await seedKnownShareOtp({
        code: "123456",
        email: allowedEmailB,
        linkId: link.id,
      });
      await visitorB.page.getByLabel("Verification Code").fill("123456");
      await visitorB.page.getByRole("button", { name: "Verify and Access" }).click();
      await expect(visitorB.page.getByText(`Verified as ${allowedEmailB}`)).toBeVisible();
    } finally {
      await clearBrowserStorage(visitorA.page);
      await clearBrowserStorage(visitorB.page);
      await visitorA.context.close();
      await visitorB.context.close();
    }
  });

  test("does not unlock for a disallowed email", async ({ browser, page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);
    const visitor = await createVisitorPage(browser);
    const allowedEmail = "reader@example.com";
    const disallowedEmail = "outsider@example.com";

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
      await requestOtp(visitor.page, disallowedEmail);
      await expect.poll(() => getLatestShareOtpRow(link.id, disallowedEmail)).toBeNull();

      await visitor.page.getByLabel("Verification Code").fill("123456");
      const verifyResponsePromise = visitor.page.waitForResponse(
        (response) =>
          response.url().includes(`/api/share/${link.token}/verify-otp`) &&
          response.request().method() === "POST",
      );
      await visitor.page.getByRole("button", { name: "Verify and Access" }).click();
      const verifyResponse = await verifyResponsePromise;

      expect(verifyResponse.status()).toBe(403);
      await expect(visitor.page.getByLabel("Verification Code")).toBeVisible();
      await expect(visitor.page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
