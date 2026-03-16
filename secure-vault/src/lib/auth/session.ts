"use server";

import { createHash } from "node:crypto";

import { and, desc, eq, gte, InferSelectModel, ne } from "drizzle-orm";
import { nanoid } from "nanoid";

import { MariadbConnection } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

const SESSION_TOKEN_LENGTH = 32;
const SESSION_ID_LENGTH = 21;
const SESSION_DURATION_MS = 15 * 60 * 1000;
const REFRESH_DURATION_DAYS = 30;

type SessionRecord = InferSelectModel<typeof sessions>;
type UserRecord = InferSelectModel<typeof users>;

export type DeviceInfo = Pick<SessionRecord, "device_name" | "ip_address">;
export type CreateSessionResult = {
  sessionToken: string;
  refreshToken: string;
};
export type SanitizedUser = Omit<UserRecord, "password_hash" | "encrypted_uek" | "updated_at">;
export type SessionSummary = Pick<
  SessionRecord,
  "id" | "device_name" | "ip_address" | "session_expires_at" | "refresh_expires_at" | "created_at"
>;

export async function generateSha256Hash(value: string): Promise<string> {
  return createHash("sha256").update(value).digest("hex");
}

function generateAuthTokens(): CreateSessionResult {
  return {
    sessionToken: nanoid(SESSION_TOKEN_LENGTH),
    refreshToken: nanoid(SESSION_TOKEN_LENGTH),
  };
}

function buildSessionExpiryDates(now = new Date()) {
  const sessionExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  const refreshExpiresAt = new Date(now);
  refreshExpiresAt.setDate(refreshExpiresAt.getDate() + REFRESH_DURATION_DAYS);

  return { sessionExpiresAt, refreshExpiresAt };
}

export async function createSession(
  userId: SessionRecord["user_id"],
  deviceInfo: DeviceInfo,
): Promise<CreateSessionResult> {
  const { sessionToken, refreshToken } = generateAuthTokens();
  const { sessionExpiresAt, refreshExpiresAt } = buildSessionExpiryDates();
  const db = MariadbConnection.getConnection();

  await db.insert(sessions).values({
    id: nanoid(SESSION_ID_LENGTH),
    user_id: userId,
    session_token_hash: await generateSha256Hash(sessionToken),
    refresh_token_hash: await generateSha256Hash(refreshToken),
    device_name: deviceInfo.device_name,
    ip_address: deviceInfo.ip_address,
    session_expires_at: sessionExpiresAt,
    refresh_expires_at: refreshExpiresAt,
  });

  return { sessionToken, refreshToken };
}

export async function validateSession(sessionToken: string): Promise<SanitizedUser | null> {
  const db = MariadbConnection.getConnection();
  const currentDate = new Date();
  const hashedSessionToken = await generateSha256Hash(sessionToken);

  const userResult = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      storage_used: users.storage_used,
      storage_quota: users.storage_quota,
      email_verified: users.email_verified,
      created_at: users.created_at,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(
      and(
        eq(sessions.session_token_hash, hashedSessionToken),
        gte(sessions.session_expires_at, currentDate),
      ),
    )
    .limit(1);

  return userResult[0] ?? null;
}

export async function validateRefreshToken(refreshToken: string): Promise<boolean> {
  const db = MariadbConnection.getConnection();
  const currentDate = new Date();
  const hashedRefreshToken = await generateSha256Hash(refreshToken);

  const sessionResult = await db
    .select({ user_id: users.id })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(
      and(
        eq(sessions.refresh_token_hash, hashedRefreshToken),
        gte(sessions.refresh_expires_at, currentDate),
      ),
    )
    .limit(1);

  return sessionResult.length > 0;
}

export async function refreshSession(refreshToken: string): Promise<CreateSessionResult | null> {
  if (!(await validateRefreshToken(refreshToken))) {
    return null;
  }

  const { sessionToken, refreshToken: newRefreshToken } = generateAuthTokens();
  const { sessionExpiresAt, refreshExpiresAt } = buildSessionExpiryDates();
  const db = MariadbConnection.getConnection();

  await db
    .update(sessions)
    .set({
      session_token_hash: await generateSha256Hash(sessionToken),
      refresh_token_hash: await generateSha256Hash(newRefreshToken),
      session_expires_at: sessionExpiresAt,
      refresh_expires_at: refreshExpiresAt,
    })
    .where(eq(sessions.refresh_token_hash, await generateSha256Hash(refreshToken)));

  return {
    sessionToken,
    refreshToken: newRefreshToken,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = MariadbConnection.getConnection();
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function getSessionByToken(
  sessionToken: string,
): Promise<Pick<SessionRecord, "id" | "user_id"> | null> {
  const db = MariadbConnection.getConnection();
  const currentDate = new Date();
  const hashedSessionToken = await generateSha256Hash(sessionToken);

  const sessionResult = await db
    .select({ id: sessions.id, user_id: sessions.user_id })
    .from(sessions)
    .where(
      and(
        eq(sessions.session_token_hash, hashedSessionToken),
        gte(sessions.session_expires_at, currentDate),
      ),
    )
    .limit(1);

  return sessionResult[0] ?? null;
}

export async function deleteSessionByToken(sessionToken: string): Promise<void> {
  const db = MariadbConnection.getConnection();
  const hashedSessionToken = await generateSha256Hash(sessionToken);
  await db.delete(sessions).where(eq(sessions.session_token_hash, hashedSessionToken));
}

export async function deleteAllSessions(userId: string): Promise<void> {
  const db = MariadbConnection.getConnection();
  await db.delete(sessions).where(eq(sessions.user_id, userId));
}

export async function deleteOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  const db = MariadbConnection.getConnection();
  await db
    .delete(sessions)
    .where(and(eq(sessions.user_id, userId), ne(sessions.id, currentSessionId)));
}

export async function listUserSessions(userId: string): Promise<SessionSummary[]> {
  const db = MariadbConnection.getConnection();

  return db
    .select({
      id: sessions.id,
      device_name: sessions.device_name,
      ip_address: sessions.ip_address,
      session_expires_at: sessions.session_expires_at,
      refresh_expires_at: sessions.refresh_expires_at,
      created_at: sessions.created_at,
    })
    .from(sessions)
    .where(eq(sessions.user_id, userId))
    .orderBy(desc(sessions.created_at));
}
