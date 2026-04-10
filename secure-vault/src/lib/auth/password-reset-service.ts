import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { hashPassword } from "@/lib/auth/password";
import { safeCompare } from "@/lib/crypto/timing";
import { deleteAllSessions } from "@/lib/auth/session";
import { MariadbConnection } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { sendPasswordResetOtpEmail } from "@/lib/email";
import { updateUserPassword } from "@/lib/db/crud/user";
import {
  AUTH_OTP_MAX_ATTEMPTS,
  createAuthOtpId,
  createOtpExpiry,
  generateOtpCode,
  hashOtpCode,
  normalizeEmailAddress,
} from "@/lib/auth/otp";

const PASSWORD_RESET_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RESET_TRANSACTION_RETRIES = 3;
const RESET_TRANSACTION_RETRY_DELAY_MS = 50;

type DbConnection = ReturnType<typeof MariadbConnection.getConnection>;
type DbTransaction = Parameters<Parameters<DbConnection["transaction"]>[0]>[0];
type DbExecutor = DbConnection | DbTransaction;

type PasswordResetUser = {
  email: string;
  id: string;
};

type PasswordResetTokenRecord = {
  attemptCount: number;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  tokenHash: string;
  usedAt: Date | null;
  userId: string;
};

export type RequestPasswordResetOtpResult = {
  delivered: boolean;
  userFound: boolean;
};

export class PasswordResetServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "PasswordResetServiceError";
    this.code = code;
    this.status = status;
  }
}

export async function requestPasswordResetOtp(email: string): Promise<RequestPasswordResetOtpResult> {
  const normalizedEmail = normalizeEmailAddress(email);
  const db = MariadbConnection.getConnection();
  const user = await findUserByEmail(db, normalizedEmail);

  if (!user) {
    return {
      delivered: false,
      userFound: false,
    };
  }

  const createdAt = new Date();
  const tokenId = createAuthOtpId();
  const code = generateOtpCode();

  // Concurrent resend requests can still race between insert and invalidation.
  // The reset flow remains safe because consume is compare-and-set guarded, but
  // a future phase should add a short-lived per-user resend lock if we need the
  // strict invariant that only one newly delivered code can exist at a time.
  await db.insert(passwordResetTokens).values({
    attempt_count: 0,
    created_at: createdAt,
    expires_at: createOtpExpiry(createdAt),
    id: tokenId,
    token_hash: hashOtpCode(code),
    user_id: user.id,
  });

  try {
    await sendPasswordResetOtpEmail(normalizedEmail, code);
  } catch (error) {
    try {
      await retirePasswordResetToken(db, tokenId);
    } catch (retireError) {
      console.error("Password reset OTP retirement failed - orphan OTP row may remain active", {
        email: normalizedEmail,
        flow: "password-reset",
        retireError,
        tokenId,
        userId: user.id,
      });
    }

    // Cleanup on the failure path is safe because active OTP rows cannot be
    // older than the 5-minute TTL, which is far shorter than the 7-day
    // retention window used for expired or already-used rows.
    await cleanupPasswordResetTokensBestEffort(db, normalizedEmail, user.id);
    console.error("Password reset OTP delivery failed", {
      email: normalizedEmail,
      error,
      flow: "password-reset",
      userId: user.id,
    });

    return {
      delivered: false,
      userFound: true,
    };
  }

  try {
    await invalidateOtherActivePasswordResetTokens(db, {
      tokenId,
      userId: user.id,
    });
  } catch (error) {
    console.error("Password reset OTP resend cleanup failed", {
      email: normalizedEmail,
      error,
      flow: "password-reset",
      tokenId,
      userId: user.id,
    });
  }

  await cleanupPasswordResetTokensBestEffort(db, normalizedEmail, user.id);

  return {
    delivered: true,
    userFound: true,
  };
}

export async function resetPasswordWithOtp(input: {
  code: string;
  email: string;
  newPassword: string;
}): Promise<void> {
  const normalizedEmail = normalizeEmailAddress(input.email);
  const hashedCode = hashOtpCode(input.code);
  let attempt = 0;

  while (true) {
    try {
      await MariadbConnection.getConnection().transaction(async (tx) => {
        const user = await findUserByEmail(tx, normalizedEmail);

        if (!user) {
          throw createOtpInvalidError();
        }

        // Lock both the latest active token and the submitted-code candidate in a
        // single transaction so another request cannot consume either between
        // validation and the compare-and-set consume step.
        const activeToken = await findLatestUnusedPasswordResetTokenForUpdate(tx, user.id);
        const matchingToken = await findLatestMatchingPasswordResetTokenForUpdate(
          tx,
          user.id,
          hashedCode,
        );
        const now = new Date();

        if (matchingToken) {
          const matchingTokenError = getTokenStateError(matchingToken, now);

          if (!matchingTokenError) {
            await consumePasswordResetToken(tx, matchingToken.id, now);
            await retireOtherActivePasswordResetTokens(tx, user.id, matchingToken.id, now);
            await updateUserPassword(user.id, await hashPassword(input.newPassword), tx);
            await deleteAllSessions(user.id, tx);
            return;
          }

          throw matchingTokenError;
        }

        if (!activeToken) {
          throw createOtpInvalidError();
        }

        if (activeToken.expiresAt < now) {
          throw matchingToken?.id === activeToken.id ? createOtpExpiredError() : createOtpInvalidError();
        }

        if (activeToken.attemptCount >= AUTH_OTP_MAX_ATTEMPTS) {
          throw matchingToken?.id === activeToken.id ? createOtpLockedError() : createOtpInvalidError();
        }

        if (!safeCompare(activeToken.tokenHash, hashedCode)) {
          const nextAttemptCount = activeToken.attemptCount + 1;

          await tx
            .update(passwordResetTokens)
            .set({ attempt_count: nextAttemptCount })
            .where(eq(passwordResetTokens.id, activeToken.id));

          if (nextAttemptCount >= AUTH_OTP_MAX_ATTEMPTS) {
            throw createOtpLockedError();
          }

          throw createOtpInvalidError();
        }

        await consumePasswordResetToken(tx, activeToken.id, now);
        await retireOtherActivePasswordResetTokens(tx, user.id, activeToken.id, now);
        await updateUserPassword(user.id, await hashPassword(input.newPassword), tx);
        await deleteAllSessions(user.id, tx);
      });

      return;
    } catch (error) {
      if (
        !shouldRetryConcurrentPasswordResetTransaction(error)
        || attempt >= MAX_RESET_TRANSACTION_RETRIES
      ) {
        throw error;
      }

      attempt += 1;
      await sleep(RESET_TRANSACTION_RETRY_DELAY_MS * attempt);
    }
  }
}

function getTokenStateError(token: PasswordResetTokenRecord, now: Date) {
  if (token.usedAt) {
    return createOtpUsedError();
  }

  if (token.expiresAt < now) {
    return createOtpExpiredError();
  }

  if (token.attemptCount >= AUTH_OTP_MAX_ATTEMPTS) {
    return createOtpLockedError();
  }

  return null;
}

async function findUserByEmail(executor: DbExecutor, email: string): Promise<PasswordResetUser | null> {
  const result = await executor
    .select({ email: users.email, id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return result[0] ?? null;
}

async function cleanupPasswordResetTokens(executor: DbExecutor, userId: string) {
  const retentionCutoff = new Date(Date.now() - PASSWORD_RESET_TOKEN_RETENTION_MS);

  // Keep expired/used reset rows for 7 days so QA and production debugging can
  // inspect recent OTP history until a scheduled retention job is introduced.
  // Active OTP rows cannot age past the 5-minute TTL under normal clock
  // conditions, so this retention cleanup cannot delete a still-valid token.
  await executor
    .delete(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.user_id, userId),
        or(
          lt(passwordResetTokens.expires_at, retentionCutoff),
          and(isNotNull(passwordResetTokens.used_at), lt(passwordResetTokens.created_at, retentionCutoff)),
        ),
      ),
    );
}

async function cleanupPasswordResetTokensBestEffort(
  executor: DbExecutor,
  email: string,
  userId: string,
) {
  try {
    await cleanupPasswordResetTokens(executor, userId);
  } catch (error) {
    console.error("Password reset OTP cleanup failed", {
      email,
      error,
      flow: "password-reset",
      userId,
    });
  }
}

async function retirePasswordResetToken(executor: DbExecutor, tokenId: string) {
  await executor
    .update(passwordResetTokens)
    .set({ used_at: new Date() })
    .where(eq(passwordResetTokens.id, tokenId));
}

async function consumePasswordResetToken(tx: DbTransaction, tokenId: string, usedAt: Date) {
  const consumeResult = await tx
    .update(passwordResetTokens)
    .set({ used_at: usedAt })
    .where(and(eq(passwordResetTokens.id, tokenId), isNull(passwordResetTokens.used_at)));

  if (getAffectedCount(consumeResult) === 0) {
    throw createOtpUsedError();
  }
}

async function retireOtherActivePasswordResetTokens(
  executor: DbExecutor,
  userId: string,
  retainedTokenId: string,
  usedAt: Date,
) {
  await executor
    .update(passwordResetTokens)
    .set({ used_at: usedAt })
    .where(
      and(
        eq(passwordResetTokens.user_id, userId),
        isNull(passwordResetTokens.used_at),
        sql`${passwordResetTokens.id} <> ${retainedTokenId}`,
      ),
    );
}

async function invalidateOtherActivePasswordResetTokens(
  executor: DbExecutor,
  input: { tokenId: string; userId: string },
) {
  await executor
    .update(passwordResetTokens)
    .set({ used_at: new Date() })
    .where(
      and(
        eq(passwordResetTokens.user_id, input.userId),
        isNull(passwordResetTokens.used_at),
        sql`${passwordResetTokens.id} <> ${input.tokenId}`,
      ),
    );
}

async function findLatestUnusedPasswordResetTokenForUpdate(
  tx: DbTransaction,
  userId: string,
): Promise<PasswordResetTokenRecord | null> {
  const rawResult = await tx.execute(sql`
    SELECT ${passwordResetTokens.id} AS id,
           ${passwordResetTokens.user_id} AS userId,
           ${passwordResetTokens.token_hash} AS tokenHash,
           ${passwordResetTokens.expires_at} AS expiresAt,
           ${passwordResetTokens.attempt_count} AS attemptCount,
           ${passwordResetTokens.used_at} AS usedAt,
           ${passwordResetTokens.created_at} AS createdAt
    FROM ${passwordResetTokens}
    WHERE ${passwordResetTokens.user_id} = ${userId}
      AND ${passwordResetTokens.used_at} IS NULL
    ORDER BY ${passwordResetTokens.created_at} DESC, ${passwordResetTokens.id} DESC
    LIMIT 1
    FOR UPDATE
  `);

  return parsePasswordResetTokenRow(unwrapSelectRows(rawResult)[0]);
}

async function findLatestMatchingPasswordResetTokenForUpdate(
  tx: DbTransaction,
  userId: string,
  tokenHash: string,
): Promise<PasswordResetTokenRecord | null> {
  const rawResult = await tx.execute(sql`
    SELECT ${passwordResetTokens.id} AS id,
           ${passwordResetTokens.user_id} AS userId,
           ${passwordResetTokens.token_hash} AS tokenHash,
           ${passwordResetTokens.expires_at} AS expiresAt,
           ${passwordResetTokens.attempt_count} AS attemptCount,
           ${passwordResetTokens.used_at} AS usedAt,
           ${passwordResetTokens.created_at} AS createdAt
    FROM ${passwordResetTokens}
    WHERE ${passwordResetTokens.user_id} = ${userId}
      AND ${passwordResetTokens.token_hash} = ${tokenHash}
    ORDER BY ${passwordResetTokens.created_at} DESC, ${passwordResetTokens.id} DESC
    LIMIT 1
    FOR UPDATE
  `);

  return parsePasswordResetTokenRow(unwrapSelectRows(rawResult)[0]);
}

function parsePasswordResetTokenRow(row: unknown): PasswordResetTokenRecord | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const userId = typeof record.userId === "string" ? record.userId : null;
  const tokenHash = typeof record.tokenHash === "string" ? record.tokenHash : null;
  const createdAt = parseDate(record.createdAt);
  const expiresAt = parseDate(record.expiresAt);
  const usedAt = parseNullableDate(record.usedAt);
  const attemptCount = Number(record.attemptCount);

  if (!id || !userId || !tokenHash || !createdAt || !expiresAt || !Number.isFinite(attemptCount)) {
    return null;
  }

  return {
    attemptCount,
    createdAt,
    expiresAt,
    id,
    tokenHash,
    usedAt,
    userId,
  };
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    // MariaDB can return UTC timestamps without a timezone suffix; normalize
    // them explicitly so Node does not reinterpret them in local time.
    const normalizedValue = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function parseNullableDate(value: unknown): Date | null {
  if (value == null) {
    return null;
  }

  return parseDate(value);
}

function unwrapSelectRows(result: unknown): unknown[] {
  if (!Array.isArray(result)) {
    return [];
  }

  const [rows] = result;

  if (Array.isArray(rows)) {
    return rows;
  }

  return result;
}

function getAffectedCount(result: unknown) {
  if (Array.isArray(result)) {
    return getAffectedCount(result[0]);
  }

  if (!result || typeof result !== "object") {
    return 0;
  }

  const maybeResult = result as { affectedRows?: number; rowsAffected?: number };
  return maybeResult.rowsAffected ?? maybeResult.affectedRows ?? 0;
}

function createOtpInvalidError() {
  return new PasswordResetServiceError("OTP_INVALID", "Invalid verification code", 403);
}

function createOtpUsedError() {
  return new PasswordResetServiceError(
    "OTP_USED",
    "Verification code has already been used. Please request a new verification code.",
    403,
  );
}

function createOtpExpiredError() {
  return new PasswordResetServiceError("OTP_EXPIRED", "Verification code has expired", 403);
}

function createOtpLockedError() {
  return new PasswordResetServiceError(
    "OTP_LOCKED",
    "Too many attempts. Please request a new verification code",
    403,
  );
}

function shouldRetryConcurrentPasswordResetTransaction(error: unknown) {
  const { code, sqlState } = getDatabaseErrorDetails(error);

  return code === "ER_LOCK_DEADLOCK" || code === "ER_CHECKREAD" || sqlState === "40001";
}

function getDatabaseErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      code: undefined,
      sqlState: undefined,
    };
  }

  const direct = error as { cause?: unknown; code?: unknown; sqlState?: unknown };
  const nested =
    direct.cause && typeof direct.cause === "object"
      ? direct.cause as { code?: unknown; sqlState?: unknown }
      : undefined;

  return {
    code:
      typeof direct.code === "string"
        ? direct.code
        : typeof nested?.code === "string"
          ? nested.code
          : undefined,
    sqlState:
      typeof direct.sqlState === "string"
        ? direct.sqlState
        : typeof nested?.sqlState === "string"
          ? nested.sqlState
          : undefined,
  };
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function isPasswordResetServiceError(error: unknown): error is PasswordResetServiceError {
  return error instanceof PasswordResetServiceError;
}
