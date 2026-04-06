import { expect, test, type Browser, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  createShareLinkFixture,
  getAllowedEmailsForLink,
  getFileIdForUser,
  getUserIdByEmail,
  openFilesPage,
  signUpAndBypassVerification,
  uploadFiles,
} from "./helpers/share";

function getFileActions(page: Page, fileName: string) {
  return page.locator(`[data-testid^="file-actions-"][data-test-file-name="${fileName}"]`).first();
}

async function openShareDialogForFile(page: Page, fileName: string) {
  await getFileActions(page, fileName).click();
  await page.getByRole("menuitem", { name: "Share" }).click();
  const shareDialog = page.getByTestId("share-dialog");
  await expect(shareDialog).toBeVisible();
  return shareDialog;
}

async function createVisitorPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();

  return { context, page };
}

test.describe("share owner validation", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("rejects lowering max downloads below the current usage", async ({
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

      expect((await visitor.page.request.get(`/api/share/${link.token}/download`)).status()).toBe(200);
      expect((await visitor.page.request.get(`/api/share/${link.token}/download`)).status()).toBe(200);

      await openShareDialogForFile(page, "tiny.pdf");
      const shareRow = page.getByTestId(`share-link-row-${link.id}`);
      await expect(shareRow).toContainText("Download limit reached: 2 used of 2");

      await shareRow.getByTestId(`share-link-edit-${link.id}`).click();
      await page.locator(`#downloads-${link.id}`).fill("1");
      await shareRow.getByTestId(`share-link-save-${link.id}`).click();

      await expect(page.getByTestId(`share-link-error-${link.id}`)).toContainText(
        "Max downloads cannot be lower than the current download count",
      );
      await expect(shareRow).toContainText("Download limit reached: 2 used of 2");
      await expect(page.locator(`#downloads-${link.id}`)).toHaveValue("1");
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });

  test("normalizes duplicate mixed-case emails in the owner edit flow", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

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

    await openShareDialogForFile(page, "tiny.pdf");
    const shareRow = page.getByTestId(`share-link-row-${link.id}`);
    await shareRow.getByTestId(`share-link-edit-${link.id}`).click();
    await page
      .locator(`#emails-${link.id}`)
      .fill(" Reader@Example.com, second@example.com, reader@example.com ");
    await shareRow.getByTestId(`share-link-save-${link.id}`).click();

    await expect(shareRow).toContainText("Restricted");
    await expect(shareRow).toContainText(
      "Allowed emails: reader@example.com, second@example.com",
    );
    await expect.poll(() => getAllowedEmailsForLink(link.id)).toEqual([
      "reader@example.com",
      "second@example.com",
    ]);
  });

  test("switches an existing restricted link back to public access", async ({
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
        allowedEmails: ["reader@example.com"],
        createdBy: userId!,
        expiresAt: null,
        fileId: fileId!,
        maxDownloads: null,
      });

      await openShareDialogForFile(page, "tiny.pdf");
      const shareRow = page.getByTestId(`share-link-row-${link.id}`);
      await expect(shareRow).toContainText("Restricted");

      await shareRow.getByTestId(`share-link-edit-${link.id}`).click();
      await page.locator(`#emails-${link.id}`).fill("");
      await shareRow.getByTestId(`share-link-save-${link.id}`).click();

      await expect(shareRow).toContainText("Public");
      await expect(shareRow).toContainText("Allowed emails: Public link");

      await visitor.page.goto(`/s/${link.token}`);
      await expect(visitor.page.getByLabel("Email Address")).toHaveCount(0);
      await expect(visitor.page.getByRole("button", { name: "Download" })).toBeVisible();
    } finally {
      await clearBrowserStorage(visitor.page);
      await visitor.context.close();
    }
  });
});
