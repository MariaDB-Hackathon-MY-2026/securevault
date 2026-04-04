import { createHash, randomInt } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { sendOTPEmail } from "@/lib/email";
import { MariadbConnection } from "@/lib/db";
import { shareLinkEmails, shareLinkOtps } from "@/lib/db/schema";
import { assertShareLinkAccessible, requireShareLinkByToken, ShareServiceError } from "@/lib/sharing/share-service";

const OTP_TTL_MINUTES = 5;
const OTP_LENGTH = 6;
const MAX_OTP_ATTEMPTS = 3;

export class OtpServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "OtpServiceError";
    this.code = code;
    this.status = status;
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function createAndSendOtp({ email, token }: { email: string; token: string }) {
  const normalizedEmail = normalizeEmail(email);
  const link = await requireShareLinkByToken(token);
  assertShareLinkAccessible(link);

  if (link.is_public || link.allowedEmails.length === 0) {
    throw new OtpServiceError("OTP_NOT_REQUIRED", "OTP is not required for this link", 400);
  }

  const db = MariadbConnection.getConnection();
  const [allowedEmail] = await db
    .select({ email: shareLinkEmails.email })
    .from(shareLinkEmails)
    .where(and(eq(shareLinkEmails.link_id, link.id), eq(shareLinkEmails.email, normalizedEmail)))
    .limit(1);

  if (!allowedEmail) {
    throw new OtpServiceError("EMAIL_NOT_ALLOWED", "If the email is allowed, a code has been sent.", 200);
  }

  const otpId = nanoid();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const code = generateOtpCode();

  await db.insert(shareLinkOtps).values({
    attempt_count: 0,
    email: normalizedEmail,
    expires_at: expiresAt,
    id: otpId,
    link_id: link.id,
    otp_hash: hashOtp(code),
  });

  try {
    await sendOTPEmail(normalizedEmail, code);
  } catch (error) {
    await db
      .update(shareLinkOtps)
      .set({ used_at: new Date() })
      .where(eq(shareLinkOtps.id, otpId));

    console.error("Share OTP delivery failed", error);
    throw new OtpServiceError("DELIVERY_FAILED", "Failed to deliver verification code", 503);
  }

  await db
    .update(shareLinkOtps)
    .set({ used_at: new Date() })
    .where(
      and(
        eq(shareLinkOtps.link_id, link.id),
        eq(shareLinkOtps.email, normalizedEmail),
        isNull(shareLinkOtps.used_at),
      ),
    );

  await db
    .update(shareLinkOtps)
    .set({ used_at: null })
    .where(eq(shareLinkOtps.id, otpId));
}

export async function verifyOtp(input: { code: string; email: string; token: string }) {
  const normalizedEmail = normalizeEmail(input.email);

  if (!/^\d{6}$/.test(input.code)) {
    throw new OtpServiceError("OTP_INVALID", "Verification code must be 6 digits", 400);
  }

  const link = await requireShareLinkByToken(input.token);
  assertShareLinkAccessible(link);

  const db = MariadbConnection.getConnection();
  const [otpRow] = await db
    .select()
    .from(shareLinkOtps)
    .where(
      and(
        eq(shareLinkOtps.link_id, link.id),
        eq(shareLinkOtps.email, normalizedEmail),
        isNull(shareLinkOtps.used_at),
      ),
    )
    .orderBy(desc(shareLinkOtps.created_at))
    .limit(1);

  if (!otpRow) {
    throw new OtpServiceError("OTP_NOT_FOUND", "Please request a new verification code", 403);
  }

  if (otpRow.expires_at < new Date()) {
    throw new OtpServiceError("OTP_EXPIRED", "Verification code has expired", 403);
  }

  if (otpRow.attempt_count >= MAX_OTP_ATTEMPTS) {
    throw new OtpServiceError(
      "OTP_LOCKED",
      "Too many attempts. Please request a new verification code",
      403,
    );
  }

  if (otpRow.otp_hash !== hashOtp(input.code)) {
    await db
      .update(shareLinkOtps)
      .set({ attempt_count: otpRow.attempt_count + 1 })
      .where(eq(shareLinkOtps.id, otpRow.id));

    throw new OtpServiceError("OTP_INVALID", "Invalid verification code", 403);
  }

  await db
    .update(shareLinkOtps)
    .set({ used_at: new Date() })
    .where(eq(shareLinkOtps.id, otpRow.id));

  return {
    email: normalizedEmail,
    linkId: link.id,
    linkExpiresAt: link.expires_at,
  };
}

export function isShareOrOtpError(error: unknown): error is ShareServiceError | OtpServiceError {
  return error instanceof ShareServiceError || error instanceof OtpServiceError;
}
