import path from "node:path";

import { and, desc, eq, isNull } from "drizzle-orm";
import { expect, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import { createFolder, moveFile } from "../../../src/app/api/files/service";
import { MariadbConnection } from "../../../src/lib/db";
import {
  files,
  folders,
  shareLinkAccessLogs,
  shareLinkEmails,
  shareLinkOtps,
  shareLinks,
  users,
} from "../../../src/lib/db/schema";
import { hashOtp } from "../../../src/lib/sharing/otp-service";
import { createShareLink } from "../../../src/lib/sharing/share-service";
import { markTestUserEmailVerified } from "./test-user-cleanup";
import type { TestUserCredentials } from "./test-user";

const SAMPLE_DIR = path.resolve(process.cwd(), "sample_upload_test_file");

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function clearBrowserStorage(page: Page) {
  try {
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  } catch {
    // Ignore cleanup failures when there is no active page origin.
  }

  await page.context().clearCookies();
}

export async function signUpAndBypassVerification(
  page: Page,
  credentials: TestUserCredentials,
) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(credentials.name);
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.waitForURL("**/activity");

  await markTestUserEmailVerified(credentials.email);
}

export async function openFilesPage(page: Page) {
  await page.goto("/files");
  await page.reload();
}

export async function ensureUploadDialogOpen(page: Page) {
  const uploadDialog = page.getByRole("dialog", { name: "Upload Files" });

  if (await uploadDialog.isVisible().catch(() => false)) {
    return uploadDialog;
  }

  await page.getByRole("button", { name: "Upload files" }).click();
  await expect(uploadDialog).toBeVisible();
  return uploadDialog;
}

export async function uploadFiles(page: Page, fileNames: readonly string[]) {
  const uploadDialog = await ensureUploadDialogOpen(page);
  const filePaths = fileNames.map((fileName) => path.join(SAMPLE_DIR, fileName));

  await page.locator('input[type="file"]').setInputFiles(filePaths);

  for (const fileName of fileNames) {
    const uploadRow = page
      .locator(`[data-testid^="upload-row-"][data-test-file-name="${fileName}"]`)
      .first();

    await expect(uploadRow).toBeVisible({ timeout: 120_000 });
    await expect(uploadRow).toContainText("Done", { timeout: 180_000 });
  }

  await page.keyboard.press("Escape");
  await expect(uploadDialog).toBeHidden();
}

export async function createFolderViaUi(page: Page, name: string) {
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill(name);
  await page.getByRole("button", { name: "Create folder" }).click();
}

export async function getUserIdByEmail(email: string) {
  const db = MariadbConnection.getConnection();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);

  return user?.id ?? null;
}

export async function getFileIdForUser(userId: string, fileName: string) {
  const db = MariadbConnection.getConnection();
  const [file] = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.user_id, userId),
        eq(files.name, fileName),
        eq(files.status, "ready"),
        isNull(files.deleted_at),
      ),
    )
    .limit(1);

  return file?.id ?? null;
}

export async function getFolderIdForUser(
  userId: string,
  folderName: string,
  parentId?: string | null,
) {
  const predicates = [
    eq(folders.user_id, userId),
    eq(folders.name, folderName),
    isNull(folders.deleted_at),
  ];

  if (parentId === null) {
    predicates.push(isNull(folders.parent_id));
  } else if (parentId) {
    predicates.push(eq(folders.parent_id, parentId));
  }

  const db = MariadbConnection.getConnection();
  const [folder] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(...predicates))
    .limit(1);

  return folder?.id ?? null;
}

export async function createFolderFixture(userId: string, name: string, parentId: string | null) {
  return createFolder(userId, name, parentId);
}

export async function moveFileFixture(userId: string, fileId: string, folderId: string | null) {
  return moveFile(userId, fileId, folderId);
}

export async function createShareLinkFixture(input: {
  allowedEmails: string[];
  createdBy: string;
  expiresAt: Date | null;
  fileId?: string;
  folderId?: string;
  maxDownloads: number | null;
}) {
  return createShareLink(input);
}

export async function getLatestShareLinkForTarget(input: {
  ownerId: string;
  fileId?: string;
  folderId?: string;
}) {
  const db = MariadbConnection.getConnection();
  const predicates = [eq(shareLinks.created_by, input.ownerId)];

  if (input.fileId) {
    predicates.push(eq(shareLinks.file_id, input.fileId));
  }

  if (input.folderId) {
    predicates.push(eq(shareLinks.folder_id, input.folderId));
  }

  const [link] = await db
    .select()
    .from(shareLinks)
    .where(and(...predicates))
    .orderBy(desc(shareLinks.created_at))
    .limit(1);

  return link ?? null;
}

export async function waitForShareOtpRow(input: {
  email: string;
  linkId: string;
  timeoutMs?: number;
}) {
  const startedAt = Date.now();
  const timeoutMs = input.timeoutMs ?? 10_000;

  while (Date.now() - startedAt < timeoutMs) {
    const otpRow = await getLatestShareOtpRow(input.linkId, input.email);

    if (otpRow) {
      return otpRow;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("Timed out waiting for share OTP row");
}

export async function getLatestShareOtpRow(linkId: string, email: string) {
  const db = MariadbConnection.getConnection();
  const [otpRow] = await db
    .select()
    .from(shareLinkOtps)
    .where(
      and(
        eq(shareLinkOtps.link_id, linkId),
        eq(shareLinkOtps.email, normalizeEmail(email)),
      ),
    )
    .orderBy(desc(shareLinkOtps.created_at))
    .limit(1);

  return otpRow ?? null;
}

export async function expireLatestShareOtp(input: {
  email: string;
  expiresAt?: Date;
  linkId: string;
}) {
  const otpRow = await getLatestShareOtpRow(input.linkId, input.email);

  if (!otpRow) {
    throw new Error("Share OTP row not found");
  }

  const db = MariadbConnection.getConnection();
  await db
    .update(shareLinkOtps)
    .set({ expires_at: input.expiresAt ?? new Date(Date.now() - 60_000) })
    .where(eq(shareLinkOtps.id, otpRow.id));
}

export async function setLatestShareOtpAttemptCount(input: {
  attemptCount: number;
  email: string;
  linkId: string;
}) {
  const otpRow = await getLatestShareOtpRow(input.linkId, input.email);

  if (!otpRow) {
    throw new Error("Share OTP row not found");
  }

  const db = MariadbConnection.getConnection();
  await db
    .update(shareLinkOtps)
    .set({ attempt_count: input.attemptCount })
    .where(eq(shareLinkOtps.id, otpRow.id));
}

export async function seedKnownShareOtp(input: {
  code: string;
  email: string;
  expiresAt?: Date;
  linkId: string;
}) {
  const db = MariadbConnection.getConnection();
  const normalizedEmail = normalizeEmail(input.email);
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000);

  await db
    .update(shareLinkOtps)
    .set({ used_at: new Date() })
    .where(
      and(
        eq(shareLinkOtps.link_id, input.linkId),
        eq(shareLinkOtps.email, normalizedEmail),
        isNull(shareLinkOtps.used_at),
      ),
    );

  const id = nanoid();
  await db.insert(shareLinkOtps).values({
    attempt_count: 0,
    created_at: new Date(),
    email: normalizedEmail,
    expires_at: expiresAt,
    id,
    link_id: input.linkId,
    otp_hash: hashOtp(input.code),
    used_at: null,
  });

  return id;
}

export async function revokeShareLinkFixture(linkId: string) {
  const db = MariadbConnection.getConnection();
  await db
    .update(shareLinks)
    .set({ revoked_at: new Date() })
    .where(eq(shareLinks.id, linkId));
}

export async function expireShareLinkFixture(linkId: string, expiresAt?: Date) {
  const db = MariadbConnection.getConnection();
  await db
    .update(shareLinks)
    .set({ expires_at: expiresAt ?? new Date(Date.now() - 60_000) })
    .where(eq(shareLinks.id, linkId));
}

export async function getShareLinkUsage(linkId: string) {
  const db = MariadbConnection.getConnection();
  const [link] = await db
    .select({
      downloadCount: shareLinks.download_count,
      maxDownloads: shareLinks.max_downloads,
      token: shareLinks.token,
    })
    .from(shareLinks)
    .where(eq(shareLinks.id, linkId))
    .limit(1);

  return link ?? null;
}

export async function getShareLinkRecord(linkId: string) {
  const db = MariadbConnection.getConnection();
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.id, linkId))
    .limit(1);

  return link ?? null;
}

export async function getShareAccessLogCount(linkId: string, email?: string) {
  const db = MariadbConnection.getConnection();
  const rows = await db
    .select({ id: shareLinkAccessLogs.id })
    .from(shareLinkAccessLogs)
    .where(
      and(
        eq(shareLinkAccessLogs.link_id, linkId),
        ...(email ? [eq(shareLinkAccessLogs.email, normalizeEmail(email))] : []),
      ),
    );

  return rows.length;
}

export async function getAllowedEmailsForLink(linkId: string) {
  const db = MariadbConnection.getConnection();
  const rows = await db
    .select({ email: shareLinkEmails.email })
    .from(shareLinkEmails)
    .where(eq(shareLinkEmails.link_id, linkId));

  return rows.map((row) => row.email).sort();
}
