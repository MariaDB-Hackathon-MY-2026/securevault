import { expect, test, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials, type TestUserCredentials } from "./helpers/test-user";
import {
  clearBrowserStorage,
  confirmAlertDialog,
  createFolder,
  getFileNameButton,
  getFolderIdForUser,
  getGridFolderButton,
  getTrashBadge,
  getTrashItemCard,
  getUserIdByEmail,
  gotoFiles,
  gotoTrash,
  moveFileByNameForUser,
  openFileActions,
  openFolderActions,
  signUpAndBypassVerification,
  softDeleteFileByNameForUser,
  softDeleteFolderByNameForUser,
  uploadFiles,
} from "./helpers/trash-helpers";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";

async function deleteFileFromFiles(page: Page, fileName: string) {
  await openFileActions(page, fileName);
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const deleteDialog = page
    .getByRole("alertdialog")
    .filter({ has: page.getByRole("button", { exact: true, name: "Delete" }) });
  await expect(deleteDialog).toBeVisible();
  await confirmAlertDialog(deleteDialog, "Delete");
  await expect(deleteDialog).toBeHidden();
  await expect(getFileNameButton(page, fileName)).toHaveCount(0);
}

async function deleteFolderFromFiles(page: Page, folderName: string) {
  await openFolderActions(page, folderName);
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const deleteDialog = page.getByRole("alertdialog", { name: "Delete folder" });
  await expect(deleteDialog).toBeVisible();
  await confirmAlertDialog(deleteDialog, "Delete folder");
  await expect(deleteDialog).toBeHidden();
  await expect(getGridFolderButton(page, folderName)).toHaveCount(0);
}

async function confirmTrashPermanentDelete(page: Page) {
  const confirmDialog = page.getByTestId("trash-confirm-dialog");
  await expect(confirmDialog).toBeVisible();
  await confirmAlertDialog(confirmDialog, "Delete permanently");
  await expect(confirmDialog).toBeHidden();
}

async function confirmEmptyTrash(page: Page) {
  const confirmDialog = page.getByTestId("trash-confirm-dialog");
  await expect(confirmDialog).toBeVisible();
  await confirmAlertDialog(confirmDialog, "Empty Trash");
  await expect(confirmDialog).toBeHidden();
  await expect(page.getByText("Trash emptied")).toBeVisible();
}

async function setUpUserWithUploads(
  page: Page,
  credentials: TestUserCredentials,
  fileNames: readonly string[],
) {
  await signUpAndBypassVerification(page, credentials);
  await gotoFiles(page);
  await uploadFiles(page, fileNames);
}

async function setUpDeletedFolderSubtree(page: Page, credentials: TestUserCredentials) {
  await setUpUserWithUploads(page, credentials, ["tiny.pdf"]);
  await createFolder(page, "Projects");
  await getGridFolderButton(page, "Projects").click();
  await createFolder(page, "Taxes");

  const userId = await getUserIdByEmail(credentials.email);
  expect(userId).not.toBeNull();
  await moveFileByNameForUser(userId!, "tiny.pdf", "Taxes");

  await gotoFiles(page);
  await deleteFolderFromFiles(page, "Projects");
  await gotoTrash(page);

  return { userId: userId! };
}

test.describe("trash flows", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("deletes a standalone file from files and shows it in trash with badge state", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await setUpUserWithUploads(page, credentials, ["tiny.pdf"]);
    await deleteFileFromFiles(page, "tiny.pdf");

    await expect(getTrashBadge(page)).toHaveText("1");
    await gotoTrash(page);
    await expect(getTrashItemCard(page, "tiny.pdf")).toBeVisible();

    await page.reload();
    await expect(getTrashBadge(page)).toHaveText("1");
    await expect(getTrashItemCard(page, "tiny.pdf")).toBeVisible();
  });

  test("restores a standalone file from trash back to files", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await setUpUserWithUploads(page, credentials, ["tiny.pdf"]);
    await deleteFileFromFiles(page, "tiny.pdf");
    await gotoTrash(page);

    const trashItem = getTrashItemCard(page, "tiny.pdf");
    await trashItem.getByRole("button", { name: "Restore" }).click();
    await expect(trashItem).toHaveCount(0);
    await expect(getTrashBadge(page)).toHaveCount(0);

    await gotoFiles(page);
    await expect(getFileNameButton(page, "tiny.pdf")).toBeVisible();
  });

  test("shows a deleted folder subtree once in trash instead of listing descendants separately", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await setUpDeletedFolderSubtree(page, credentials);

    await expect(getTrashItemCard(page, "Projects")).toBeVisible();
    await expect(getTrashItemCard(page, "tiny.pdf")).toHaveCount(0);
    await expect(page.getByText("1 file and 1 folder in this deleted subtree")).toBeVisible();
    await expect(getTrashBadge(page)).toHaveText("1");
  });

  test("restores a deleted folder subtree to its original hierarchy", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await setUpDeletedFolderSubtree(page, credentials);

    const trashItem = getTrashItemCard(page, "Projects");
    await trashItem.getByRole("button", { name: "Restore" }).click();
    await expect(trashItem).toHaveCount(0);
    await expect(getTrashBadge(page)).toHaveCount(0);

    await gotoFiles(page);
    await expect(getGridFolderButton(page, "Projects")).toBeVisible();
    await getGridFolderButton(page, "Projects").click();
    await expect(getGridFolderButton(page, "Taxes")).toBeVisible();
    await getGridFolderButton(page, "Taxes").click();
    await expect(getFileNameButton(page, "tiny.pdf")).toBeVisible();
  });

  test("permanently deletes a trashed file and keeps it unrecoverable", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await setUpUserWithUploads(page, credentials, ["tiny.pdf"]);
    await deleteFileFromFiles(page, "tiny.pdf");
    await gotoTrash(page);

    const trashItem = getTrashItemCard(page, "tiny.pdf");
    await trashItem.getByRole("button", { name: "Delete permanently" }).click();
    await confirmTrashPermanentDelete(page);
    await expect(trashItem).toHaveCount(0);
    await expect(getTrashBadge(page)).toHaveCount(0);

    await gotoFiles(page);
    await expect(getFileNameButton(page, "tiny.pdf")).toHaveCount(0);
    await gotoTrash(page);
    await expect(getTrashItemCard(page, "tiny.pdf")).toHaveCount(0);
  });

  test("permanently deletes a trashed folder subtree and removes all descendants", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await setUpDeletedFolderSubtree(page, credentials);

    const trashItem = getTrashItemCard(page, "Projects");
    await trashItem.getByRole("button", { name: "Delete permanently" }).click();
    await confirmTrashPermanentDelete(page);
    await expect(trashItem).toHaveCount(0);
    await expect(page.getByTestId("trash-empty-state")).toBeVisible();

    await gotoFiles(page);
    await expect(getGridFolderButton(page, "Projects")).toHaveCount(0);
    await expect(getFileNameButton(page, "tiny.pdf")).toHaveCount(0);
  });

  test("empties trash with mixed standalone files and deleted folders", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const credentials = buildTestUserCredentials(testInfo);

    await setUpUserWithUploads(page, credentials, ["tiny.pdf", "photo.png"]);
    await createFolder(page, "Projects");
    await getGridFolderButton(page, "Projects").click();
    await createFolder(page, "Taxes");

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();
    await moveFileByNameForUser(userId!, "tiny.pdf", "Taxes");

    await softDeleteFileByNameForUser(userId!, "photo.png");
    await softDeleteFolderByNameForUser(userId!, "Projects");
    await gotoTrash(page);

    await expect(getTrashItemCard(page, "photo.png")).toBeVisible();
    await expect(getTrashItemCard(page, "Projects")).toBeVisible();

    await page.getByTestId("empty-trash-button").click();
    await confirmEmptyTrash(page);

    await expect(page.getByTestId("trash-empty-state")).toBeVisible();
    await expect(getTrashBadge(page)).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("trash-empty-state")).toBeVisible();
    await expect(getTrashBadge(page)).toHaveCount(0);
  });

  test("surfaces a restore conflict when the parent folder is deleted after trash loads", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const credentials = buildTestUserCredentials(testInfo);

    await setUpUserWithUploads(page, credentials, ["tiny.pdf"]);
    await createFolder(page, "Projects");

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();
    await moveFileByNameForUser(userId!, "tiny.pdf", "Projects");
    await softDeleteFileByNameForUser(userId!, "tiny.pdf");

    await gotoTrash(page);
    const trashItem = getTrashItemCard(page, "tiny.pdf");
    await expect(trashItem).toBeVisible();

    await softDeleteFolderByNameForUser(userId!, "Projects");

    await trashItem.getByRole("button", { name: "Restore" }).click();
    await expect(getTrashItemCard(page, "Projects")).toBeVisible();
    await expect(getTrashItemCard(page, "tiny.pdf")).toHaveCount(0);
    await expect(getTrashBadge(page)).toHaveText("1");

    await gotoFiles(page);
    await expect(getFileNameButton(page, "tiny.pdf")).toHaveCount(0);

    await gotoTrash(page);
    await expect(getTrashItemCard(page, "Projects")).toBeVisible();

    const deletedFolderId = await getFolderIdForUser(userId!, "Projects");
    expect(deletedFolderId).not.toBeNull();
  });
});
