import { expect, test, type Browser, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createShareLinkFixture,
  expireShareOtpById,
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

test.describe("share restricted edge cases", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("locks the current otp after repeated wrong codes", async ({ browser, page }, testInfo) => {
    test.setTimeout(180_000);
    const allowedEmail = "reader@example.com";
    const visitor = await createVisitorPage(browser);

    try {
      await signUpAndBypassVerification(page, buildTestUserCredentials(testInfo));
      await openFilesPage(page);
      await uploadFiles(page, ["tiny.pdf"]);

      const userId = await getUserIdByEmail(buildTestUserCredentials(testInfo).email);
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
      await requestOtp(visitor.page, allowedEmail);
      await waitForShareOtpRow({ email: allowedEmail, linkId: link.id });
      await seedKnownShareOtp({ code: "123456", email: allowedEmail, linkId: link.id });

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        await visitor.page.getByLabel("Verification Code").fill("000000");
        await visitor.page.getByRole("button", { name: "Verify and Access" }).click();
        await expect(visitor.page.getByTestId("share-auth-error")).toContainText(
          "Invalid verification code",
        );
      }

      await visitor.page.getByLabel("Verification Code").fill("000000");
      await visitor.page.getByRole("button", { name: "Verify and Access" }).click();
      await expect(visitor.page.getByTestId("share-auth-error")).toContainText(
        "Too many attempts. Please request a new verification code",
      );
      await expect(visitor.page.getByLabel("Verification Code")).toBeVisible();
      await expect(visitor.page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });

  test("rejects an expired otp and keeps the visitor gated", async ({ browser, page }, testInfo) => {
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
      await requestOtp(visitor.page, allowedEmail);
      await waitForShareOtpRow({ email: allowedEmail, linkId: link.id });
      const otpId = await seedKnownShareOtp({ code: "123456", email: allowedEmail, linkId: link.id });
      await expireShareOtpById({ id: otpId });

      await visitor.page.getByLabel("Verification Code").fill("123456");
      await visitor.page.getByRole("button", { name: "Verify and Access" }).click();
      await expect(visitor.page.getByTestId("share-auth-error")).toContainText(
        "Verification code has expired",
      );
      await expect(visitor.page.getByLabel("Verification Code")).toBeVisible();
      await expect(visitor.page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });

  test("invalidates the previous otp when a new code is requested", async ({ browser, page }, testInfo) => {
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
      await requestOtp(visitor.page, allowedEmail);
      await waitForShareOtpRow({ email: allowedEmail, linkId: link.id });
      await seedKnownShareOtp({ code: "111111", email: allowedEmail, linkId: link.id });
      const firstOtp = await getLatestShareOtpRow(link.id, allowedEmail);
      expect(firstOtp).not.toBeNull();

      await visitor.page.getByRole("button", { name: "Use a different email" }).click();
      await expect(visitor.page.getByLabel("Email Address")).toBeVisible();
      await requestOtp(visitor.page, allowedEmail);
      await waitForShareOtpRow({ email: allowedEmail, linkId: link.id });
      await seedKnownShareOtp({ code: "222222", email: allowedEmail, linkId: link.id });
      const secondOtp = await getLatestShareOtpRow(link.id, allowedEmail);
      expect(secondOtp).not.toBeNull();
      expect(secondOtp?.id).not.toBe(firstOtp?.id);

      await visitor.page.getByLabel("Verification Code").fill("111111");
      await visitor.page.getByRole("button", { name: "Verify and Access" }).click();
      await expect(visitor.page.getByTestId("share-auth-error")).toContainText(
        "Invalid verification code",
      );

      await visitor.page.getByLabel("Verification Code").fill("222222");
      await visitor.page.getByRole("button", { name: "Verify and Access" }).click();
      await expect(visitor.page.getByRole("button", { name: "Sign out" })).toBeVisible();
      await expect(visitor.page.getByText(`Verified as ${allowedEmail}`)).toBeVisible();
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
