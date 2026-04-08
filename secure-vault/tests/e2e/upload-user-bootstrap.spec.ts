import { expect, test, type Page } from "./helpers/e2e-test";

import {
  cleanupTestUserByEmail,
  markTestUserEmailVerified,
} from "./helpers/test-user-cleanup";
import { buildTestUserCredentials } from "./helpers/test-user";

async function clearBrowserStorage(page: Page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Ignore storage cleanup failures when the current page has no storage access.
  }

  await page.context().clearCookies();
}

test.describe("upload user bootstrap", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("creates a test user, bypasses email verification, and unlocks uploads", async ({ page }, testInfo) => {
    const credentials = buildTestUserCredentials(testInfo);

    await cleanupTestUserByEmail(credentials.email);

    await page.goto("/signup");

    await page.getByLabel("Name").fill(credentials.name);
    await page.getByLabel("Email").fill(credentials.email);
    await page.getByLabel("Password").fill(credentials.password);
    const submitButton = page.getByRole("button", { name: "Create an account" });
    await expect(page.getByText("Password strength looks good.")).toBeVisible();
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await page.waitForURL("**/activity");

    await markTestUserEmailVerified(credentials.email);

    await page.goto("/files");
    await page.reload();

    await expect(
      page.locator(
        '[data-testid="files-library-toolbar"]:visible [data-testid="files-library-toolbar-upload-trigger"]:visible',
      ),
    ).toBeVisible();
    await expect(page.getByText("Please verify your email to enable file uploads.")).toHaveCount(0);
  });
});
