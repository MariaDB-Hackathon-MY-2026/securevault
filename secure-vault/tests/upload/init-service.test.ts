import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nanoid: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: mocks.nanoid,
}));

import * as cryptoModule from "@/lib/crypto";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import { MariadbConnection } from "@/lib/db";
import { files, uploadSessions } from "@/lib/db/schema";
import {
  MAX_UPLOAD_SIZE_BYTES,
  PENDING_FILE_MIME_TYPE,
  UPLOAD_CHUNK_SIZE_BYTES,
} from "@/lib/constants";
import {
  UploadInitServiceError,
  buildUploadInitLockName,
  calculateTotalChunks,
  checkQuotaAndFileSize,
  initializeUpload,
  validateInitBody,
} from "@/app/api/upload/init/service";

function createCurrentUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "user-1",
    email: "alice@example.com",
    name: "Alice",
    storage_used: 0,
    storage_quota: MAX_UPLOAD_SIZE_BYTES * 2,
    email_verified: true,
    created_at: new Date("2026-03-18T00:00:00.000Z"),
    uek: Buffer.alloc(32, 1),
    ...overrides,
  };
}

function createTransactionHarness(options?: {
  existingUpload?: Array<{ fileId: string; uploadId: string; totalChunks: number }>;
  fileInsertError?: Error;
  uploadInsertError?: Error;
}) {
  const fileValues = vi.fn(async () => {
    if (options?.fileInsertError) {
      throw options.fileInsertError;
    }
  });
  const uploadValues = vi.fn(async () => {
    if (options?.uploadInsertError) {
      throw options.uploadInsertError;
    }
  });
  const insert = vi.fn((table: unknown) => {
    if (table === files) {
      return { values: fileValues };
    }

    if (table === uploadSessions) {
      return { values: uploadValues };
    }

    throw new Error("Unexpected table insert");
  });

  // The service now calls tx.execute(sql`SELECT ... FOR UPDATE`) once.
  // It returns rows with camelCase aliases (AS fileId, AS uploadId, AS totalChunks).
  const execute = vi
    .fn()
    .mockResolvedValue(options?.existingUpload ?? []);

  const tx = {
    execute,
    insert,
  };

  const db = {
    transaction: vi.fn((callback: (transaction: unknown) => Promise<unknown>) => callback(tx)),
  };

  return {
    db,
    tx,
    spies: {
      dbTransaction: db.transaction,
      execute,
      fileValues,
      insert,
      uploadValues,
    },
  };
}

describe("upload init service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.spyOn(cryptoModule, "generateFEK").mockReturnValue(Buffer.alloc(32, 2));
    vi.spyOn(cryptoModule, "encryptFEK").mockReturnValue(Buffer.from("wrapped-fek"));
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("sanitizes the filename and preserves valid upload metadata", () => {
    const result = validateInitBody({
      fileName: "  ../sec/re?t.pdf  ",
      fileSize: 123,
      fileType: "application/pdf",
    });

    expect(result).toEqual({
      fileName: "secret.pdf",
      fileSize: 123,
      fileType: "application/pdf",
    });
  });

  it("rejects non-integer file sizes", () => {
    expect(() =>
      validateInitBody({
        fileName: "report.pdf",
        fileSize: 1.5,
        fileType: "application/pdf",
      }),
    ).toThrowError(UploadInitServiceError);
  });

  it("rejects blank file types", () => {
    expect(() =>
      validateInitBody({
        fileName: "report.pdf",
        fileSize: 512,
        fileType: "   ",
      }),
    ).toThrowError(UploadInitServiceError);
  });

  it("enforces the user storage quota", () => {
    const user = createCurrentUser({
      storage_used: 900,
      storage_quota: 1000,
    });

    expect(() => checkQuotaAndFileSize(user, 101)).toThrowError(UploadInitServiceError);
  });

  it("enforces the max upload size", () => {
    const user = createCurrentUser();

    expect(() => checkQuotaAndFileSize(user, MAX_UPLOAD_SIZE_BYTES + 1)).toThrowError(
      UploadInitServiceError,
    );
  });

  it("calculates one chunk for an exact chunk-sized file", () => {
    expect(calculateTotalChunks(UPLOAD_CHUNK_SIZE_BYTES)).toBe(1);
  });

  it("rounds up chunk counts for partial final chunks", () => {
    expect(calculateTotalChunks((2 * UPLOAD_CHUNK_SIZE_BYTES) + 1)).toBe(3);
  });

  it("builds a deterministic advisory lock name", () => {
    expect(buildUploadInitLockName("user-1", "report.pdf", 42)).toBe(
      "upload:init:user-1:report.pdf:42",
    );
  });

  it("returns an existing active upload without generating new records or keys", async () => {
    const harness = createTransactionHarness({
      existingUpload: [
        {
          fileId: "file-existing",
          uploadId: "upload-existing",
          totalChunks: 4,
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await initializeUpload(createCurrentUser(), {
      fileName: "report.pdf",
      fileSize: 4 * UPLOAD_CHUNK_SIZE_BYTES,
      fileType: "application/pdf",
    });

    expect(result).toEqual({
      fileId: "file-existing",
      uploadId: "upload-existing",
      totalChunks: 4,
    });
    expect(harness.spies.insert).not.toHaveBeenCalled();
    expect(mocks.nanoid).not.toHaveBeenCalled();
    expect(cryptoModule.generateFEK).not.toHaveBeenCalled();
    expect(cryptoModule.encryptFEK).not.toHaveBeenCalled();
    expect(harness.spies.execute).toHaveBeenCalledTimes(1);
  });

  it("creates both file and upload-session records for a new upload", async () => {
    const harness = createTransactionHarness();
    const currentDate = new Date("2026-03-19T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(currentDate);
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.nanoid.mockReturnValueOnce("file-new").mockReturnValueOnce("upload-new");

    const result = await initializeUpload(createCurrentUser(), {
      fileName: "report.pdf",
      fileSize: (2 * UPLOAD_CHUNK_SIZE_BYTES) + 10,
      fileType: "application/pdf",
    });

    expect(result).toEqual({
      fileId: "file-new",
      uploadId: "upload-new",
      totalChunks: 3,
    });
    expect(harness.spies.fileValues).toHaveBeenCalledWith({
      id: "file-new",
      user_id: "user-1",
      name: "report.pdf",
      mime_type: PENDING_FILE_MIME_TYPE,
      size: (2 * UPLOAD_CHUNK_SIZE_BYTES) + 10,
      total_chunks: 3,
      encrypted_fek: Buffer.from("wrapped-fek"),
      status: "uploading",
    });
    expect(harness.spies.uploadValues).toHaveBeenCalledWith({
      id: "upload-new",
      user_id: "user-1",
      file_id: "file-new",
      file_name: "report.pdf",
      file_size: (2 * UPLOAD_CHUNK_SIZE_BYTES) + 10,
      total_chunks: 3,
      completed_chunks: 0,
      status: "uploading",
      expires_at: new Date("2026-03-20T00:00:00.000Z"),
    });
    expect(cryptoModule.generateFEK).toHaveBeenCalledTimes(1);
    expect(cryptoModule.encryptFEK).toHaveBeenCalledWith(Buffer.alloc(32, 2), Buffer.alloc(32, 1));
    expect(harness.spies.execute).toHaveBeenCalledTimes(1);
    expect(harness.spies.dbTransaction).toHaveBeenCalledTimes(1);
  });

  it("propagates insert errors from the transaction", async () => {
    const harness = createTransactionHarness({
      fileInsertError: new Error("insert failed"),
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.nanoid.mockReturnValueOnce("file-new").mockReturnValueOnce("upload-new");

    await expect(
      initializeUpload(createCurrentUser(), {
        fileName: "report.pdf",
        fileSize: 100,
        fileType: "application/pdf",
      }),
    ).rejects.toThrow("insert failed");

    expect(harness.spies.execute).toHaveBeenCalledTimes(1);
    expect(harness.spies.uploadValues).not.toHaveBeenCalled();
  });
});
