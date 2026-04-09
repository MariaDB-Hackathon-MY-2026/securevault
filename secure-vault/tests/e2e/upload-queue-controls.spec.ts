import path from "node:path";

import { expect, test, type Page } from "./helpers/e2e-test";

import {
  cleanupTestUserByEmail,
  markTestUserEmailVerified,
} from "./helpers/test-user-cleanup";
import { buildTestUserCredentials, type TestUserCredentials } from "./helpers/test-user";

const SAMPLE_DIR = path.resolve(process.cwd(), "sample_upload_test_file");

const QUEUE_FILE_PAYLOADS = [
  {
    name: "tiny.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 tiny"),
  },
  {
    name: "chunked.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 chunked"),
  },
  {
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from("png"),
  },
  {
    name: "animated.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("gif"),
  },
] as const;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
};

type UploadRecord = {
  fileId: string;
  fileName: string;
  uploadId: string;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function clearBrowserStorage(page: Page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Ignore storage cleanup failures when there is no active page origin.
  }

  await page.context().clearCookies();
}

async function signUpAndBypassVerification(page: Page, credentials: TestUserCredentials) {
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
}

async function openUploadDialog(page: Page) {
  await page.goto("/files");
  await page.reload();
  await ensureUploadDialogOpen(page);
}

async function ensureUploadDialogOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    return;
  }

  await page.locator(
    '[data-testid="files-library-toolbar"]:visible [data-testid="files-library-toolbar-upload-trigger"]:visible',
  ).click();
  await expect(uploadDialog).toBeVisible();
}

async function setUploadFiles(page: Page) {
  await ensureUploadDialogOpen(page);
  await page.locator('input[type="file"]').setInputFiles(QUEUE_FILE_PAYLOADS);
}

async function setUploadFilesFromSampleDirectory(page: Page, fileNames: readonly string[]) {
  const filePaths = fileNames.map((fileName) => path.join(SAMPLE_DIR, fileName));
  await ensureUploadDialogOpen(page);
  await page.locator('input[type="file"]').setInputFiles(filePaths);
}

function uploadRow(page: Page, fileName: string) {
  return page.locator(`[data-testid^="upload-row-"][data-test-file-name="${fileName}"]`).first();
}

async function expectUploadDone(
  page: Page,
  fileName: string,
  uploadId: string,
  completedUploadIds: Set<string>,
) {
  await expect.poll(() => completedUploadIds.has(uploadId)).toBe(true);
  await expect(
    page.getByRole("button", { name: `Remove upload ${fileName}` }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(uploadRow(page, fileName)).toContainText("Done", {
    timeout: 15_000,
  });
}

function releaseNextChunk(
  uploadId: string,
  chunkGates: Map<string, Array<Deferred<void>>>,
) {
  const gate = chunkGates.get(uploadId)?.shift();

  if (!gate) {
    throw new Error(`Missing chunk gate for upload ${uploadId}`);
  }

  gate.resolve();
}

async function waitForUploadId(
  fileName: string,
  uploadsByFileName: Map<string, UploadRecord>,
) {
  await expect.poll(() => uploadsByFileName.get(fileName)?.uploadId ?? null).not.toBeNull();

  const uploadId = uploadsByFileName.get(fileName)?.uploadId;

  if (!uploadId) {
    throw new Error(`Missing upload id for ${fileName}`);
  }

  return uploadId;
}

async function mockUploadSlotRoutes(page: Page) {
  await page.route("**/api/upload/start", async (route) => {
    const body = route.request().postDataJSON() as { uploadId?: string };

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        activeCount: 1,
        maxActiveUploads: 3,
        uploadId: body.uploadId ?? "upload-unknown",
      }),
    });
  });

  await page.route("**/api/upload/release", async (route) => {
    const body = route.request().postDataJSON() as { uploadId?: string };

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        released: true,
        uploadId: body.uploadId ?? "upload-unknown",
      }),
    });
  });
}

test.describe("upload queue controls", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const { email } = buildTestUserCredentials(testInfo);

    await clearBrowserStorage(page);
    await cleanupTestUserByEmail(email);
  });

  test("handles queue saturation plus cancel, pause, resume, and remove", async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    const credentials = buildTestUserCredentials(testInfo);
    const uploadsByFileName = new Map<string, UploadRecord>();
    const uploadsById = new Map<string, UploadRecord>();
    const chunkGates = new Map<string, Array<Deferred<void>>>();
    const completedUploadIds = new Set<string>();
    let uploadCounter = 0;

    await page.route("**/api/upload/init", async (route) => {
      const body = route.request().postDataJSON() as { fileName: string };
      let record = uploadsByFileName.get(body.fileName);

      if (!record) {
        uploadCounter += 1;
        record = {
          fileId: `file-${uploadCounter}`,
          fileName: body.fileName,
          uploadId: `upload-${uploadCounter}`,
        };

        uploadsByFileName.set(record.fileName, record);
        uploadsById.set(record.uploadId, record);
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          fileId: record.fileId,
          totalChunks: 1,
          uploadId: record.uploadId,
        }),
      });
    });

    await page.route("**/api/upload/status?*", async (route) => {
      const uploadId = new URL(route.request().url()).searchParams.get("uploadId");
      const record = uploadId ? uploadsById.get(uploadId) : null;

      if (!record) {
        throw new Error(`Missing upload record for status request: ${route.request().url()}`);
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          completedChunkIndexes: [],
          fileId: record.fileId,
          status: "uploading",
          totalChunks: 1,
          uploadId: record.uploadId,
        }),
      });
    });

    await mockUploadSlotRoutes(page);

    await page.route("**/api/upload/chunk", async (route) => {
      const uploadId = route.request().headers()["x-upload-id"];

      if (!uploadId) {
        throw new Error("Missing upload id on chunk request");
      }

      const gate = createDeferred<void>();
      const queue = chunkGates.get(uploadId) ?? [];
      queue.push(gate);
      chunkGates.set(uploadId, queue);

      await gate.promise;

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          chunkIndex: Number(route.request().headers()["x-chunk-index"] ?? "0"),
          status: "uploaded",
        }),
      });
    });

    await page.route("**/api/upload/complete", async (route) => {
      const body = route.request().postDataJSON() as { uploadId: string };
      const record = uploadsById.get(body.uploadId);

      if (!record) {
        throw new Error(`Missing upload record for complete request: ${body.uploadId}`);
      }

      completedUploadIds.add(body.uploadId);

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          fileId: record.fileId,
          status: "ready",
        }),
      });
    });

    await page.route("**/api/embeddings", async (route) => {
      await route.fulfill({
        status: 204,
      });
    });

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await setUploadFiles(page);

    await expect(page.getByRole("heading", { name: "Upload Queue (4)" })).toBeVisible();
    await expect(uploadRow(page, "animated.gif")).toContainText(/queued/i);

    await page.getByRole("button", { name: "Pause upload tiny.pdf" }).click();
    await expect(uploadRow(page, "tiny.pdf")).toContainText(/pausing/i);

    await page.getByRole("button", { name: "Cancel upload animated.gif" }).click();
    await expect(uploadRow(page, "animated.gif")).toContainText(/cancelled/i);

    const tinyUploadId = await waitForUploadId("tiny.pdf", uploadsByFileName);
    const chunkedUploadId = await waitForUploadId("chunked.pdf", uploadsByFileName);
    const photoUploadId = await waitForUploadId("photo.png", uploadsByFileName);

    await expect.poll(() => chunkGates.get(tinyUploadId)?.length ?? 0).toBeGreaterThan(0);
    await expect.poll(() => chunkGates.get(chunkedUploadId)?.length ?? 0).toBeGreaterThan(0);
    await expect.poll(() => chunkGates.get(photoUploadId)?.length ?? 0).toBeGreaterThan(0);

    releaseNextChunk(tinyUploadId, chunkGates);
    await expect(uploadRow(page, "tiny.pdf")).toContainText(/paused/i);

    releaseNextChunk(chunkedUploadId, chunkGates);
    await expectUploadDone(page, "chunked.pdf", chunkedUploadId, completedUploadIds);

    releaseNextChunk(photoUploadId, chunkGates);
    await expectUploadDone(page, "photo.png", photoUploadId, completedUploadIds);

    await page.getByRole("button", { name: "Resume upload tiny.pdf" }).click();

    await expect.poll(() => chunkGates.get(tinyUploadId)?.length ?? 0).toBeGreaterThan(0);
    releaseNextChunk(tinyUploadId, chunkGates);
    await expectUploadDone(page, "tiny.pdf", tinyUploadId, completedUploadIds);

    await page.getByRole("button", { name: "Remove upload animated.gif" }).click();
    await expect(page.getByText("animated.gif", { exact: true })).toHaveCount(0);
  });

  test("resumes a partially uploaded multi-chunk file from the status endpoint", async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    const credentials = buildTestUserCredentials(testInfo);
    const uploadedChunkIndexes: number[] = [];
    const uploadRecord = {
      fileId: "file-resume",
      uploadId: "upload-resume",
    };

    await page.route("**/api/upload/init", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          fileId: uploadRecord.fileId,
          totalChunks: 3,
          uploadId: uploadRecord.uploadId,
        }),
      });
    });

    await page.route("**/api/upload/status?*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          completedChunkIndexes: [0],
          fileId: uploadRecord.fileId,
          status: "uploading",
          totalChunks: 3,
          uploadId: uploadRecord.uploadId,
        }),
      });
    });

    await mockUploadSlotRoutes(page);

    await page.route("**/api/upload/chunk", async (route) => {
      uploadedChunkIndexes.push(Number(route.request().headers()["x-chunk-index"] ?? "-1"));

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          chunkIndex: Number(route.request().headers()["x-chunk-index"] ?? "0"),
          status: "uploaded",
        }),
      });
    });

    await page.route("**/api/upload/complete", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          fileId: uploadRecord.fileId,
          status: "ready",
        }),
      });
    });

    await page.route("**/api/embeddings", async (route) => {
      await route.fulfill({ status: 204 });
    });

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await setUploadFilesFromSampleDirectory(page, ["chunked.pdf"]);

    await expect(uploadRow(page, "chunked.pdf")).toContainText("Done", {
      timeout: 120_000,
    });
    await expect
      .poll(() => [...uploadedChunkIndexes].sort((a, b) => a - b))
      .toEqual([1, 2]);
  });

  test("resumes a multi-chunk upload after a reload and skips already completed chunks", async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    const credentials = buildTestUserCredentials(testInfo);
    const initialPhaseChunkIndexes: number[] = [];
    const resumedPhaseChunkIndexes: number[] = [];
    const uploadRecord = {
      fileId: "file-reload-resume",
      uploadId: "upload-reload-resume",
    };
    let phase: "initial" | "resume" = "initial";
    let initCallCount = 0;

    await page.route("**/api/upload/init", async (route) => {
      initCallCount += 1;

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          fileId: uploadRecord.fileId,
          totalChunks: 3,
          uploadId: uploadRecord.uploadId,
        }),
      });
    });

    await page.route("**/api/upload/status?*", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          completedChunkIndexes: phase === "initial" ? [] : [0],
          fileId: uploadRecord.fileId,
          status: "uploading",
          totalChunks: 3,
          uploadId: uploadRecord.uploadId,
        }),
      });
    });

    await mockUploadSlotRoutes(page);

    await page.route("**/api/upload/chunk", async (route) => {
      const chunkIndex = Number(route.request().headers()["x-chunk-index"] ?? "-1");

      if (phase === "initial") {
        initialPhaseChunkIndexes.push(chunkIndex);
      } else {
        resumedPhaseChunkIndexes.push(chunkIndex);
      }

      if (phase === "initial" && chunkIndex === 1) {
        await route.abort("failed");
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          chunkIndex,
          status: "uploaded",
        }),
      });
    });

    await page.route("**/api/upload/complete", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          fileId: uploadRecord.fileId,
          status: "ready",
        }),
      });
    });

    await page.route("**/api/embeddings", async (route) => {
      await route.fulfill({ status: 204 });
    });

    await signUpAndBypassVerification(page, credentials);
    await openUploadDialog(page);
    await setUploadFilesFromSampleDirectory(page, ["chunked.pdf"]);

    await expect(uploadRow(page, "chunked.pdf")).toContainText(/failed|error/i, {
      timeout: 120_000,
    });
    await expect.poll(() => [...initialPhaseChunkIndexes]).toContain(0);
    await expect.poll(() => [...initialPhaseChunkIndexes]).toContain(1);

    phase = "resume";
    await page.reload();
    await openUploadDialog(page);
    await setUploadFilesFromSampleDirectory(page, ["chunked.pdf"]);

    await expect(uploadRow(page, "chunked.pdf")).toContainText("Done", {
      timeout: 120_000,
    });
    expect(initCallCount).toBeGreaterThanOrEqual(2);
    expect(initialPhaseChunkIndexes).toContain(0);
    expect(initialPhaseChunkIndexes).toContain(1);
    expect(resumedPhaseChunkIndexes).not.toContain(0);
    expect(resumedPhaseChunkIndexes).toContain(1);
    expect(resumedPhaseChunkIndexes).toContain(2);
  });
});

