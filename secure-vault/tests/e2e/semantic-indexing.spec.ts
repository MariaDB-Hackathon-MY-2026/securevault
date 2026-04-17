import { expect, test } from "./helpers/e2e-test";

import {
  getFileIdByName,
  markSemanticJobFailed,
  waitForSemanticJobStatus,
} from "./helpers/semantic-helpers";
import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  clearBrowserStorage,
  gotoFiles,
  openFileActions,
  signUpAndBypassVerification,
  uploadFiles,
} from "./helpers/trash-helpers";

test.describe("semantic indexing actions", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("retries a retryable failed semantic indexing job from the file actions menu", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await gotoFiles(page);
    await uploadFiles(page, ["tiny.pdf"]);

    const fileId = await getFileIdByName(page, "tiny.pdf");
    await markSemanticJobFailed({
      errorCode: "EMBEDDING_PROVIDER_FAILED",
      errorMessage: "Provider timed out while indexing the file.",
      fileId,
      modality: "pdf",
    });

    await gotoFiles(page);
    await openFileActions(page, "tiny.pdf");
    await expect(page.getByRole("menuitem", { name: "Retry indexing" })).toBeVisible();

    await page.getByRole("menuitem", { name: "Retry indexing" }).click();

    await waitForSemanticJobStatus({
      expectedStatus: "ready",
      fileId,
      modality: "pdf",
      page,
    });

    await openFileActions(page, "tiny.pdf");
    await expect(page.getByRole("menuitem", { name: "Indexed" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Re-index file" })).toBeVisible();
  });

  test("shows unretryable indexing details and allows re-indexing after a terminal failure", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await gotoFiles(page);
    await uploadFiles(page, ["tiny.pdf"]);

    const fileId = await getFileIdByName(page, "tiny.pdf");
    await markSemanticJobFailed({
      errorCode: "VECTOR_DIMENSION_MISMATCH",
      errorMessage: "Vector dimensions do not match the configured schema.",
      fileId,
      modality: "pdf",
    });

    await gotoFiles(page);
    await openFileActions(page, "tiny.pdf");
    await expect(page.getByText("Retry unavailable")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "View details" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Re-index file" })).toBeVisible();

    await page.getByRole("menuitem", { name: "View details" }).click();

    const detailsDialog = page.getByRole("dialog", { name: "Retry unavailable" });
    await expect(detailsDialog).toBeVisible();
    await expect(detailsDialog.getByText("VECTOR_DIMENSION_MISMATCH")).toBeVisible();
    await expect(detailsDialog.getByText("Vector dimensions do not match the configured schema.")).toBeVisible();

    await detailsDialog.getByRole("button", { name: "Re-index file" }).click();

    await waitForSemanticJobStatus({
      expectedStatus: "ready",
      fileId,
      modality: "pdf",
      page,
    });
  });
});
