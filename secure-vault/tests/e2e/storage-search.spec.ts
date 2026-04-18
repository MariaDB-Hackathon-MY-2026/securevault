import { expect, test, type Page } from "./helpers/e2e-test";

import { buildTestUserCredentials } from "./helpers/test-user";
import { cleanupTestUserByEmail } from "./helpers/test-user-cleanup";
import {
  createPdfUploadPayload,
  getFileIdByName,
  waitForSemanticJobStatus,
} from "./helpers/semantic-helpers";
import {
  clearBrowserStorage,
  createFolder,
  ensureUploadDialogOpen,
  getFileNameButton,
  getFolderIdForUser,
  getUserIdByEmail,
  gotoFiles,
  moveFileByNameForUser,
  signUpAndBypassVerification,
  softDeleteFileByNameForUser,
  uploadFiles,
} from "./helpers/trash-helpers";

const FILENAME_SEARCH_PREFERENCE_KEY = "securevault.files.search.filename-enabled";

async function enableFilenameSearch(page: Page) {
  await page.evaluate((storageKey) => {
    window.localStorage.setItem(storageKey, "true");
  }, FILENAME_SEARCH_PREFERENCE_KEY);
}

async function gotoStorage(page: Page) {
  await page.goto("/storage");
  await page.reload();
}

function getSearchInput(page: Page) {
  return page.locator(
    '[data-testid="files-library-toolbar"]:visible [data-testid="files-library-toolbar-search-input"]:visible',
  );
}

function waitForSemanticSearchResponse(page: Page, query: string) {
  return page.waitForResponse((response) => {
    if (!response.url().includes("/api/search/semantic")) {
      return false;
    }

    const postData = response.request().postData();
    if (!postData) {
      return false;
    }

    try {
      const payload = JSON.parse(postData) as { query?: unknown };
      return payload.query === query;
    } catch {
      return false;
    }
  });
}

test.describe("storage dashboard and filename search", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("renders the storage dashboard zero state for a new user", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await gotoStorage(page);

    await expect(page.getByText("Storage overview")).toBeVisible();
    await expect(page.getByText("Category breakdown")).toBeVisible();
    await expect(page.getByText("Largest files")).toBeVisible();
    await expect(page.getByText("No active files yet. Uploads will appear here once they are ready.")).toBeVisible();
  });

  test("updates storage cards after uploads and opens a filename search result back in the file explorer", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await enableFilenameSearch(page);
    await gotoFiles(page);
    await uploadFiles(page, ["tiny.pdf", "photo.png"]);

    await gotoStorage(page);

    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.getByText("Images")).toBeVisible();

    await gotoFiles(page);
    await createFolder(page, "Projects");

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();
    await moveFileByNameForUser(userId!, "tiny.pdf", "Projects");

    await gotoFiles(page);
    const searchResponse = page.waitForResponse((response) =>
      response.url().includes("/api/search/files?q=tiny") && response.ok(),
    );
    await getSearchInput(page).fill("tiny");
    await searchResponse;

    await expect(page.getByRole("button", { name: "Open folder" })).toBeVisible();
    await expect(page.getByText("Projects")).toBeVisible();

    await page.getByRole("button", { name: "Open folder" }).click();

    await expect(getSearchInput(page)).toHaveValue("");
    await expect(getFileNameButton(page, "tiny.pdf")).toBeVisible();
  });

  test("does not call global filename search for one-character queries", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const credentials = buildTestUserCredentials(testInfo);

    await signUpAndBypassVerification(page, credentials);
    await enableFilenameSearch(page);
    await gotoFiles(page);

    await getSearchInput(page).fill("r");

    await expect(page.getByText("Keep typing to search")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open folder" })).toHaveCount(0);
  });

  test("renders a semantic PDF result with page-range context and opens its folder in the explorer", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const credentials = buildTestUserCredentials(testInfo);
    const uploadPayload = await createPdfUploadPayload({
      name: "semantic-project-overview.pdf",
      pageTexts: [
        "Storage roadmap kickoff with shared assumptions.",
        "Semantic search anchor clause for projects page two.",
        "Folder navigation details for the storage explorer.",
        "Closing summary for the semantic storage walkthrough.",
      ],
    });

    await signUpAndBypassVerification(page, credentials);
    await gotoFiles(page);

    const uploadDialog = await ensureUploadDialogOpen(page);
    await uploadDialog.locator('input[type="file"]').setInputFiles(uploadPayload);
    await expect(uploadDialog.locator('[data-testid^="upload-row-"][data-test-file-name="semantic-project-overview.pdf"]').first()).toContainText("Done", {
      timeout: 120_000,
    });
    await page.keyboard.press("Escape");
    await expect(uploadDialog).toBeHidden();

    await createFolder(page, "Projects");

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();
    await moveFileByNameForUser(userId!, "semantic-project-overview.pdf", "Projects");
    const projectsFolderId = await getFolderIdForUser(userId!, "Projects");
    expect(projectsFolderId).not.toBeNull();

    const fileId = await getFileIdByName(page, "semantic-project-overview.pdf");
    await waitForSemanticJobStatus({
      expectedStatus: "ready",
      fileId,
      modality: "pdf",
      page,
    });
    const semanticQuery = "Semantic search anchor clause for projects page two";

    await gotoFiles(page);
    const searchResponsePromise = waitForSemanticSearchResponse(page, semanticQuery);
    await getSearchInput(page).fill(semanticQuery);
    const searchResponse = await searchResponsePromise;
    expect(searchResponse.status()).toBe(200);
    const searchPayload = await searchResponse.json() as {
      results: Array<{
        fileId: string;
        matchType: string;
        pageFrom: number | null;
        pageTo: number | null;
      }>;
    };

    expect(searchPayload.results.some((result) =>
      result.fileId === fileId
      && result.matchType === "pdf_page"
      && result.pageFrom === 2
      && result.pageTo === 2,
    )).toBeTruthy();

    const resultCard = page.locator('[data-testid^="file-search-result-"][data-test-file-name="semantic-project-overview.pdf"]').first();
    await expect(resultCard).toBeVisible();
    await expect(resultCard).toContainText("Semantic PDF match on pages 2-2");
    await expect(resultCard).toContainText("Projects");
    await expect(page.getByRole("button", { name: "Open folder" })).toBeVisible();

    await page.getByRole("button", { name: "Open folder" }).click();

    await expect(getSearchInput(page)).toHaveValue("");
    await expect(getFileNameButton(page, "semantic-project-overview.pdf")).toBeVisible();
  });

  test("renders a semantic window match for a multi-page PDF as a single file card", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const credentials = buildTestUserCredentials(testInfo);
    const uploadPayload = await createPdfUploadPayload({
      name: "windowed-report.pdf",
      pageCount: 8,
      pageTextPrefix: "Windowed semantic test",
    });

    await signUpAndBypassVerification(page, credentials);
    await gotoFiles(page);

    const uploadDialog = await ensureUploadDialogOpen(page);
    await uploadDialog.locator('input[type="file"]').setInputFiles(uploadPayload);
    await expect(uploadDialog.locator('[data-testid^="upload-row-"][data-test-file-name="windowed-report.pdf"]').first()).toContainText("Done", {
      timeout: 120_000,
    });
    await page.keyboard.press("Escape");
    await expect(uploadDialog).toBeHidden();

    const fileId = await getFileIdByName(page, "windowed-report.pdf");
    await waitForSemanticJobStatus({
      expectedStatus: "ready",
      fileId,
      modality: "pdf",
      page,
    });
    const semanticQuery = "Windowed semantic test page 6 page 7 page 8";

    const searchResponsePromise = waitForSemanticSearchResponse(page, semanticQuery);
    await getSearchInput(page).fill(semanticQuery);
    const searchResponse = await searchResponsePromise;
    expect(searchResponse.status()).toBe(200);
    const searchPayload = await searchResponse.json() as {
      results: Array<{
        fileId: string;
        matchType: string;
        pageFrom: number | null;
        pageTo: number | null;
      }>;
    };

    expect(searchPayload.results.some((result) =>
      result.fileId === fileId
      && result.matchType === "pdf_window"
      && result.pageFrom === 6
      && result.pageTo === 8,
    )).toBeTruthy();

    const resultCard = page.locator('[data-testid^="file-search-result-"][data-test-file-name="windowed-report.pdf"]').first();
    await expect(resultCard).toBeVisible();
    await expect(resultCard).toContainText("Semantic PDF match on pages 6-8");
  });

  test("stops showing an indexed file in semantic search after the file is soft deleted", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const credentials = buildTestUserCredentials(testInfo);
    const uploadPayload = await createPdfUploadPayload({
      name: "semantic-delete-check.pdf",
      pageTexts: [
        "Archive retention semantic anchor for delete verification.",
        "Follow up detail for deleted semantic result coverage.",
      ],
    });

    await signUpAndBypassVerification(page, credentials);
    await gotoFiles(page);

    const uploadDialog = await ensureUploadDialogOpen(page);
    await uploadDialog.locator('input[type="file"]').setInputFiles(uploadPayload);
    await expect(uploadDialog.locator('[data-testid^="upload-row-"][data-test-file-name="semantic-delete-check.pdf"]').first()).toContainText("Done", {
      timeout: 120_000,
    });
    await page.keyboard.press("Escape");
    await expect(uploadDialog).toBeHidden();

    const userId = await getUserIdByEmail(credentials.email);
    expect(userId).not.toBeNull();

    const fileId = await getFileIdByName(page, "semantic-delete-check.pdf");
    await waitForSemanticJobStatus({
      expectedStatus: "ready",
      fileId,
      modality: "pdf",
      page,
    });
    const semanticQuery = "Archive retention semantic anchor for delete verification";

    const firstSearchResponsePromise = waitForSemanticSearchResponse(page, semanticQuery);
    await getSearchInput(page).fill(semanticQuery);
    const firstSearchResponse = await firstSearchResponsePromise;
    expect(firstSearchResponse.status()).toBe(200);
    const firstSearchPayload = await firstSearchResponse.json() as {
      results: Array<{
        fileId: string;
        matchType: string;
        pageFrom: number | null;
        pageTo: number | null;
      }>;
    };

    expect(firstSearchPayload.results.some((result) =>
      result.fileId === fileId
      && result.matchType === "pdf_page"
      && result.pageFrom === 1
      && result.pageTo === 1,
    )).toBeTruthy();
    await expect(page.locator('[data-testid^="file-search-result-"][data-test-file-name="semantic-delete-check.pdf"]').first()).toBeVisible();

    await softDeleteFileByNameForUser(userId!, "semantic-delete-check.pdf");

    await gotoFiles(page);
    const secondSearchResponsePromise = waitForSemanticSearchResponse(page, semanticQuery);
    await getSearchInput(page).fill(semanticQuery);
    const secondSearchResponse = await secondSearchResponsePromise;
    expect(secondSearchResponse.status()).toBe(200);
    const secondSearchPayload = await secondSearchResponse.json() as {
      results: Array<{ fileId: string }>;
    };

    expect(secondSearchPayload.results.some((result) => result.fileId === fileId)).toBeFalsy();
    await expect(page.locator('[data-testid^="file-search-result-"][data-test-file-name="semantic-delete-check.pdf"]').first()).toHaveCount(0);
    await expect(page.getByText("No semantic matches")).toBeVisible();
  });
});
