import { eq } from "drizzle-orm";

import { createAuthOtpId, createOtpExpiry, hashOtpCode, normalizeEmailAddress } from "../../../src/lib/auth/otp";
import { MariadbConnection } from "../../../src/lib/db";
import { passwordResetTokens, users } from "../../../src/lib/db/schema";

export async function replacePasswordResetOtp(email: string, code: string, options?: {
  attemptCount?: number;
  expiresAt?: Date;
  usedAt?: Date | null;
}) {
  const normalizedEmail = normalizeEmailAddress(email);
  const db = MariadbConnection.getConnection();
  const user = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user[0]) {
    throw new Error(`No user found for password reset OTP helper: ${normalizedEmail}`);
  }

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, user[0].id));

  const createdAt = new Date();
  await db.insert(passwordResetTokens).values({
    attempt_count: options?.attemptCount ?? 0,
    created_at: createdAt,
    expires_at: options?.expiresAt ?? createOtpExpiry(createdAt),
    id: createAuthOtpId(createdAt.getTime()),
    token_hash: hashOtpCode(code),
    used_at: options?.usedAt ?? null,
    user_id: user[0].id,
  });
}
