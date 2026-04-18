import { expect, test, type Page } from "./helpers/e2e-test";

import { replacePasswordResetOtp } from "./helpers/password-reset";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import { buildTestUserCredentials, type TestUserCredentials } from "./helpers/test-user";

async function clearBrowserStorage(page: Page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Ignore storage cleanup failures when the current page has no storage access.
  }

  try {
    await page.context().clearCookies();
  } catch {
    // Ignore cleanup failures when the page context is already closed.
  }
}

async function waitForDashboard(page: Page) {
  await expect(page).toHaveURL(/\/activity(?:\?|$)/, { timeout: 45_000 });
  await expect(
    page.getByRole("heading", { level: 2, name: "Account activity timeline" }),
  ).toBeVisible({ timeout: 45_000 });
}

async function signUp(page: Page, credentials: TestUserCredentials) {
  await cleanupTestUserByEmail(credentials.email);

  await page.goto("/signup");
  await page.getByLabel("Name").fill(credentials.name);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);

  const submitButton = page.getByRole("button", { name: "Create an account" });
  await expect(page.getByText("Password strength looks good.")).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await waitForDashboard(page);
}

async function login(page: Page, credentials: Pick<TestUserCredentials, "email" | "password">) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Login" }).click();
  await waitForDashboard(page);
}

test.describe("password reset", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const credentials = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(credentials.email);
  });

  test("new signups are immediately treated as verified", async ({ page }, testInfo) => {
    const credentials = buildTestUserCredentials(testInfo);

    await signUp(page, credentials);
    await page.goto("/files");
    await page.reload();

    await expect(page.getByText("Please verify your email to enable file uploads.")).toHaveCount(0);
  });

  test("forgot-password request stays generic and reset invalidates existing sessions", async ({
    browser,
    page,
  }, testInfo) => {
    const credentials = buildTestUserCredentials(testInfo);
    const newPassword = `${credentials.password}-reset`;

    await signUp(page, credentials);

    const secondaryContext = await browser.newContext();
    const secondaryPage = await secondaryContext.newPage();

    try {
      await login(secondaryPage, credentials);

      await page.goto("/forgot-password");
      await page.getByLabel("Email").fill(credentials.email);
      await page.getByRole("button", { name: "Send verification code" }).click();
      await expect(page.getByText("Verification code requested")).toBeVisible();

      await replacePasswordResetOtp(credentials.email, "123456");

      await page.goto(`/reset-password?email=${encodeURIComponent(credentials.email)}`);
      await page.getByLabel("Verification Code").fill("123456");
      await page.getByLabel("New Password").fill(newPassword);
      await page.getByRole("button", { name: "Reset password" }).click();

      await expect(page.getByText("Password reset successful", { exact: true })).toBeVisible();

      const currentUserStatus = await secondaryPage.evaluate(async () => {
        const response = await fetch("/api/auth/current-user", {
          credentials: "same-origin",
        });

        return response.status;
      });

      expect(currentUserStatus).toBe(401);

      await login(page, {
        email: credentials.email,
        password: newPassword,
      });
    } finally {
      await secondaryContext.close();
    }
  });

  test("used, expired, and locked reset codes surface actionable guidance", async ({ page }, testInfo) => {
    const credentials = buildTestUserCredentials(testInfo);

    await signUp(page, credentials);

    await replacePasswordResetOtp(credentials.email, "111111", {
      usedAt: new Date(),
    });

    await page.goto(`/reset-password?email=${encodeURIComponent(credentials.email)}`);
    await page.getByLabel("Verification Code").fill("111111");
    await page.getByLabel("New Password").fill(`${credentials.password}-used`);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Need a new code?")).toBeVisible();

    await replacePasswordResetOtp(credentials.email, "222222", {
      expiresAt: new Date(Date.now() - 60_000),
    });

    await page.getByLabel("Verification Code").fill("222222");
    await page.getByLabel("New Password").fill(`${credentials.password}-expired`);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Verification code has expired")).toBeVisible();

    await replacePasswordResetOtp(credentials.email, "333333", {
      attemptCount: 3,
    });

    await page.getByLabel("Verification Code").fill("333333");
    await page.getByLabel("New Password").fill(`${credentials.password}-locked`);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByText("Too many attempts. Please request a new verification code")).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend code" })).toBeVisible();
  });
});
