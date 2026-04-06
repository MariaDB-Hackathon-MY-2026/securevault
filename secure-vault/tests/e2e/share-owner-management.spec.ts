import { expect, test, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  getAllowedEmailsForLink,
  getFileIdForUser,
  getLatestShareLinkForTarget,
  getUserIdByEmail,
  openFilesPage,
  signUpAndBypassVerification,
  uploadFiles,
} from "./helpers/share";

function getFileActions(page: Page, fileName: string) {
  return page.locator(`[data-testid^="file-actions-"][data-test-file-name="${fileName}"]`).first();
}

test.describe("share owner management", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("creates, edits, and revokes a share link from the owner dialog", async ({
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

    await getFileActions(page, "tiny.pdf").click();
    await page.getByRole("menuitem", { name: "Share" }).click();

    const shareDialog = page.getByTestId("share-dialog");
    await expect(shareDialog).toBeVisible();

    await shareDialog.getByRole("button", { name: "Generate Link" }).click();

    await expect
      .poll(async () =>
        getLatestShareLinkForTarget({
          fileId: fileId!,
          ownerId: userId!,
        }),
      )
      .not.toBeNull();
    const link = await getLatestShareLinkForTarget({
      fileId: fileId!,
      ownerId: userId!,
    });
    expect(link).not.toBeNull();

    const shareRow = page.getByTestId(`share-link-row-${link!.id}`);
    await expect(shareRow).toBeVisible();
    await expect(shareRow).toContainText("Public");
    await expect(shareRow).toContainText("Downloads used: 0 (unlimited)");
    await expect(shareRow).toContainText("Allowed emails: Public link");

    await shareRow.getByTestId(`share-link-edit-${link!.id}`).click();
    await page.locator(`#emails-${link!.id}`).fill(
      " Reader@Example.com, second@example.com, reader@example.com ",
    );
    await page.locator(`#downloads-${link!.id}`).fill("3");
    await shareRow.getByTestId(`share-link-save-${link!.id}`).click();

    await expect(shareRow).toContainText("Restricted");
    await expect(shareRow).toContainText(
      "Allowed emails: reader@example.com, second@example.com",
    );
    await expect(shareRow).toContainText("Downloads used: 0 of 3");
    await expect.poll(() => getAllowedEmailsForLink(link!.id)).toEqual([
      "reader@example.com",
      "second@example.com",
    ]);

    await shareRow.getByTestId(`share-link-edit-${link!.id}`).click();
    await page.locator(`#emails-${link!.id}`).fill("");
    await shareRow.getByTestId(`share-link-save-${link!.id}`).click();

    await expect(shareRow).toContainText("Public");
    await expect(shareRow).toContainText("Allowed emails: Public link");

    await shareRow.getByTestId(`share-link-revoke-${link!.id}`).click();
    await expect(shareRow).toHaveCount(0);
  });
});
