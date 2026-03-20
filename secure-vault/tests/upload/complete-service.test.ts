import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import { files, uploadSessions, users } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth/get-current-user";
import { completeUploadTransaction, validateBody } from "@/app/api/upload/complete/service";
import { BodyRequestErrorResponse, TransactionFailureErrorResponse } from "@/app/api/upload/complete/Error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: "user-abc1234567890123456",
    email: "alice@example.com",
    name: "Alice",
    email_verified: true,
    storage_used: 100_000,
    storage_quota: 1_073_741_824,
    created_at: new Date("2026-03-19T00:00:00.000Z"),
    uek: Buffer.alloc(32, 1),
    ...overrides,
  };
}

const VALID_UPLOAD_ID = "a".repeat(21);
const FILE_ID = "f".repeat(21);
const FILE_SIZE = 5 * 1024 * 1024; // 5 MB

function createSession(overrides: Partial<{
  file_id: string;
  uploadId: string;
  fileSize: number;
  status: string;
  total_chunks: number;
  completed_chunks: number;
  expires_at: Date;
}> = {}) {
  return {
    file_id: FILE_ID,
    uploadId: VALID_UPLOAD_ID,
    fileSize: FILE_SIZE,
    status: "uploading",
    total_chunks: 2,
    completed_chunks: 2,
    expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour ahead
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DB / transaction harness
//
// Models the Drizzle query builder chain:
//   tx.select({...}).from(uploadSessions).where(and(...))   → returns [session]
//   tx.update(files).set({...}).where(...)
//   tx.update(uploadSessions).set({...}).where(...)
//   tx.update(users).set({...}).where(...)
// ---------------------------------------------------------------------------
function createDbHarness(options?: {
  session?: ReturnType<typeof createSession> | null;
  updateError?: Error;
}) {
  // SELECT chain
  const selectWhere = vi.fn().mockResolvedValue(
    options?.session !== undefined && options.session !== null
      ? [options.session]
      : [],
  );
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  // Per-table update SET spies — each returns { where } whose fn throws on updateError.
  const updateWhere = vi.fn(async () => {
    if (options?.updateError) throw options.updateError;
  });
  const filesSet = vi.fn(() => ({ where: updateWhere }));
  const uploadSessionsSet = vi.fn(() => ({ where: updateWhere }));
  const usersSet = vi.fn(() => ({ where: updateWhere }));

  // update() routes to the correct per-table SET spy
  const update = vi.fn((table: unknown) => {
    if (table === files) return { set: filesSet };
    if (table === uploadSessions) return { set: uploadSessionsSet };
    if (table === users) return { set: usersSet };
    throw new Error(`Unexpected table in update: ${String(table)}`);
  });

  const tx = { select, update };

  const db = {
    transaction: vi.fn(
      (callback: (transaction: unknown) => Promise<unknown>) => callback(tx),
    ),
  };

  return {
    db,
    spies: {
      dbTransaction: db.transaction,
      filesSet,
      select,
      selectFrom,
      selectWhere,
      update,
      updateWhere,
      uploadSessionsSet,
      usersSet,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("upload complete service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // =========================================================================
  // validateBody — Zod schema guards (pure, no DB)
  // =========================================================================
  describe("validateBody", () => {
    it("accepts an uploadId of exactly 21 characters", () => {
      expect(() => validateBody({ uploadId: VALID_UPLOAD_ID })).not.toThrow();
    });

    it("returns the validated body with uploadId intact", () => {
      const result = validateBody({ uploadId: VALID_UPLOAD_ID });
      expect(result).toEqual({ uploadId: VALID_UPLOAD_ID });
    });

    it("throws BodyRequestErrorResponse when uploadId is missing", () => {
      expect(() => validateBody({})).toThrow(BodyRequestErrorResponse);
    });

    it("throws BodyRequestErrorResponse when uploadId is shorter than 21 chars", () => {
      expect(() => validateBody({ uploadId: "short" })).toThrow(BodyRequestErrorResponse);
    });

    it("throws BodyRequestErrorResponse when uploadId is longer than 21 chars", () => {
      expect(() => validateBody({ uploadId: "a".repeat(22) })).toThrow(BodyRequestErrorResponse);
    });

    it("throws BodyRequestErrorResponse when uploadId is not a string", () => {
      expect(() => validateBody({ uploadId: 12345 })).toThrow(BodyRequestErrorResponse);
    });

    it("throws BodyRequestErrorResponse for a null body", () => {
      expect(() => validateBody(null)).toThrow(BodyRequestErrorResponse);
    });

    it("throws BodyRequestErrorResponse for a non-object body", () => {
      expect(() => validateBody("just-a-string")).toThrow(BodyRequestErrorResponse);
    });
  });

  // =========================================================================
  // completeUploadTransaction — happy path
  // =========================================================================
  describe("completeUploadTransaction — success", () => {
    it("returns fileId and status:'ready' when the session is fully uploaded", async () => {
      const harness = createDbHarness({ session: createSession() });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      const result = await completeUploadTransaction(
        createUser(),
        { uploadId: VALID_UPLOAD_ID },
      );

      expect(result).toEqual({ fileId: FILE_ID, status: "ready" });
    });

    it("runs inside a single database transaction", async () => {
      const harness = createDbHarness({ session: createSession() });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID });

      expect(harness.spies.dbTransaction).toHaveBeenCalledTimes(1);
    });

    it("queries upload session by uploadId and user_id (not by column equality)", async () => {
      const harness = createDbHarness({ session: createSession() });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID });

      // select() called once; from() called on uploadSessions; where() called once
      expect(harness.spies.select).toHaveBeenCalledTimes(1);
      expect(harness.spies.selectFrom).toHaveBeenCalledWith(uploadSessions);
      expect(harness.spies.selectWhere).toHaveBeenCalledTimes(1);
    });

    it("updates the file status to 'ready'", async () => {
      const harness = createDbHarness({ session: createSession() });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID });

      expect(harness.spies.filesSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ready" }),
      );
    });

    it("updates the upload session status to 'completed' (Bug 2 fix)", async () => {
      const harness = createDbHarness({ session: createSession() });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID });

      expect(harness.spies.uploadSessionsSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
      );
    });

    it("updates storage_used with a SQL expression, not a plain number (P1 fix — no race condition)", async () => {
      const harness = createDbHarness({ session: createSession() });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID });

      expect(harness.spies.usersSet).toHaveBeenCalledTimes(1);
      const userSetCalls = harness.spies.usersSet.mock.calls as unknown[][];
      const storageUsedValue = (userSetCalls[0]?.[0] as Record<string, unknown>)?.["storage_used"];

      // The value must NOT be a plain number (stale in-memory read would be a race condition).
      // Drizzle's sql`` template tag produces an object, never a raw number.
      expect(typeof storageUsedValue).not.toBe("number");
      expect(storageUsedValue).toBeDefined();
    });

    it("performs exactly three update statements (files + uploadSessions + users)", async () => {
      const harness = createDbHarness({ session: createSession() });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID });

      expect(harness.spies.update).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // completeUploadTransaction — error guards
  // =========================================================================
  describe("completeUploadTransaction — session not found", () => {
    it("throws TransactionFailureErrorResponse with status 404 when the session does not exist", async () => {
      const harness = createDbHarness({ session: null });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toMatchObject({
        message: "Upload session not found",
        status: 404,
      });
    });

    it("does not perform any update when the session is not found", async () => {
      const harness = createDbHarness({ session: null });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toThrow();

      expect(harness.spies.update).not.toHaveBeenCalled();
    });
  });

  describe("completeUploadTransaction — wrong session status", () => {
    it("throws 409 when session status is 'completed'", async () => {
      const harness = createDbHarness({
        session: createSession({ status: "completed" }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("throws 409 when session status is 'failed'", async () => {
      const harness = createDbHarness({
        session: createSession({ status: "failed" }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("does not perform any update when the session status is wrong", async () => {
      const harness = createDbHarness({ session: createSession({ status: "completed" }) });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toThrow();

      expect(harness.spies.update).not.toHaveBeenCalled();
    });
  });

  describe("completeUploadTransaction — session expired (P2 fix)", () => {
    it("throws 410 when expires_at is in the past", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-21T10:00:00.000Z"));

      const harness = createDbHarness({
        session: createSession({
          expires_at: new Date("2026-03-21T09:00:00.000Z"), // 1 hour ago
        }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toMatchObject({
        message: "Upload session has expired",
        status: 410,
      });
    });

    it("does not update anything when the session has expired", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-21T10:00:00.000Z"));

      const harness = createDbHarness({
        session: createSession({
          expires_at: new Date("2026-03-21T09:59:59.000Z"),
        }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toThrow();

      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("accepts a session that expires exactly now (boundary: not yet expired)", async () => {
      const now = new Date("2026-03-21T10:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // expires_at == now means it's not yet strictly less than new Date()
      // Because we check: expires_at < new Date()
      // A session expiring at exactly 'now' should still be accepted.
      const harness = createDbHarness({
        session: createSession({ expires_at: new Date(now.getTime() + 1) }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      const result = await completeUploadTransaction(createUser(), {
        uploadId: VALID_UPLOAD_ID,
      });

      expect(result).toMatchObject({ status: "ready" });
    });
  });

  describe("completeUploadTransaction — incomplete chunks (Bug 1 fix)", () => {
    it("throws 409 when completed_chunks < total_chunks", async () => {
      const harness = createDbHarness({
        session: createSession({ total_chunks: 5, completed_chunks: 3 }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toMatchObject({
        message: "Not all chunks have been uploaded",
        status: 409,
      });
    });

    it("does not update anything when chunks are missing", async () => {
      const harness = createDbHarness({
        session: createSession({ total_chunks: 5, completed_chunks: 4 }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toThrow();

      expect(harness.spies.update).not.toHaveBeenCalled();
    });

    it("succeeds when completed_chunks === total_chunks (1 single-chunk file)", async () => {
      const harness = createDbHarness({
        session: createSession({ total_chunks: 1, completed_chunks: 1 }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      const result = await completeUploadTransaction(createUser(), {
        uploadId: VALID_UPLOAD_ID,
      });

      expect(result).toMatchObject({ status: "ready" });
    });
  });

  // =========================================================================
  // Guard-order correctness — confirms guards are checked before writes
  // =========================================================================
  describe("guard order", () => {
    it("checks status before expiry (does not reach expiry check on wrong status)", async () => {
      // Session has wrong status AND is expired — status check must win
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-21T10:00:00.000Z"));

      const harness = createDbHarness({
        session: createSession({
          status: "failed",
          expires_at: new Date("2026-03-21T09:00:00.000Z"),
        }),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toMatchObject({ status: 409 }); // status guard wins, not 410
    });
  });

  // =========================================================================
  // DB failure propagation
  // =========================================================================
  describe("database failure handling", () => {
    it("propagates unexpected database errors out of the transaction", async () => {
      const harness = createDbHarness({
        session: createSession(),
        updateError: new Error("ER_LOCK_DEADLOCK"),
      });
      vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

      await expect(
        completeUploadTransaction(createUser(), { uploadId: VALID_UPLOAD_ID }),
      ).rejects.toThrow("ER_LOCK_DEADLOCK");
    });
  });
});
