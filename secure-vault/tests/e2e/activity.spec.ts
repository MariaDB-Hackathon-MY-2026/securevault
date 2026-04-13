import { expect, test, type Browser, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createShareLinkFixture,
  getFileIdForUser,
  getLatestShareLinkForTarget,
  getUserIdByEmail,
  openFilesPage,
  revokeShareLinkFixture,
  signUpAndBypassVerification,
  uploadFiles,
} from "./helpers/share";
import { softDeleteFileByNameForUser } from "./helpers/trash-helpers";

async function createVisitorPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  return { context, page };
}

async function openActivity(page: Page, cursor?: string) {
  await page.goto(cursor ? `/activity?cursor=${encodeURIComponent(cursor)}` : "/activity");
  await expect(page).toHaveURL(cursor ? /\/activity\?cursor=/ : /\/activity$/);
}

function getActivityMain(page: Page) {
  return page.getByRole("main");
}

function getActivityFeed(page: Page) {
  return getActivityMain(page).getByTestId("activity-feed");
}

test.describe("activity page", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("renders a safe empty state for a brand-new account and tolerates malformed cursors", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);

    await openActivity(page);
    await expect(getActivityMain(page).getByTestId("activity-empty-state")).toBeVisible();
    await expect(getActivityMain(page).getByRole("heading", { name: "No activity yet" })).toBeVisible();

    await openActivity(page, "not-a-valid-cursor");
    await expect(getActivityMain(page).getByTestId("activity-empty-state")).toBeVisible();
    await expect(getActivityMain(page).getByRole("heading", { name: "No activity yet" })).toBeVisible();
  });

  test("shows upload completion plus share create and revoke events", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await openFilesPage(page);
    await uploadFiles(page, ["tiny.pdf"]);

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();
    const fileId = await getFileIdForUser(userId!, "tiny.pdf");
    expect(fileId).not.toBeNull();

    await expect.poll(() => getLatestShareLinkForTarget({ fileId: fileId!, ownerId: userId! })).toBeNull();
    await createShareLinkFixture({
      allowedEmails: [],
      createdBy: userId!,
      expiresAt: null,
      fileId: fileId!,
      maxDownloads: null,
    });

    const link = await getLatestShareLinkForTarget({
      fileId: fileId!,
      ownerId: userId!,
    });
    expect(link).not.toBeNull();

    await revokeShareLinkFixture(link!.id);

    await openActivity(page);
    await expect(getActivityFeed(page)).toBeVisible();
    await expect(getActivityFeed(page).getByText("Upload completed")).toBeVisible();
    await expect(getActivityFeed(page).getByText("You completed the upload for tiny.pdf.")).toBeVisible();
    await expect(getActivityFeed(page).getByText("Share link created")).toBeVisible();
    await expect(getActivityFeed(page).getByText("You created a share link for tiny.pdf.")).toBeVisible();
    await expect(getActivityFeed(page).getByText("Share link revoked")).toBeVisible();
    await expect(getActivityFeed(page).getByText("You revoked a share link for tiny.pdf.")).toBeVisible();
  });

  test("shows share access events and keeps soft-deleted targets readable but non-navigable", async ({ browser, page }, testInfo) => {
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

      await visitor.page.goto(`/s/${link.token}`);
      await expect(visitor.page).toHaveURL(new RegExp(`/s/${link.token}$`));
      await expect(visitor.page.getByTestId("shared-file-view")).toBeVisible();
      await expect(visitor.page.getByRole("button", { name: "Download" })).toBeVisible();

      await softDeleteFileByNameForUser(userId!, "tiny.pdf");

      await openActivity(page);
      await expect(getActivityFeed(page)).toBeVisible();
      await expect(
        getActivityFeed(page).getByRole("listitem").filter({ hasText: "Shared link accessed" }),
      ).toBeVisible();
      await expect(getActivityFeed(page).getByText("Deleted item was accessed through a shared link.")).toBeVisible();
      await expect(
        getActivityFeed(page).getByRole("listitem").filter({ hasText: "Share link created" }),
      ).toBeVisible();
      await expect(getActivityFeed(page).getByText("You created a share link for Deleted item.")).toBeVisible();
      await expect(getActivityFeed(page).getByRole("link", { name: /Open/i })).toHaveCount(0);
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
