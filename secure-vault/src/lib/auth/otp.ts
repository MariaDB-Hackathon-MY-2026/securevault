import { createHash, randomInt } from "node:crypto";

import { nanoid } from "nanoid";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const AUTH_OTP_ID_LENGTH = 21;

export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function createOtpExpiry(now: Date) {
  return new Date(now.getTime() + OTP_TTL_MS);
}

export function createAuthOtpId() {
  const otpId = nanoid(AUTH_OTP_ID_LENGTH);

  if (otpId.length > AUTH_OTP_ID_LENGTH) {
    throw new Error("Generated auth OTP id exceeds schema column length");
  }

  return otpId;
}

export const AUTH_OTP_LENGTH = OTP_LENGTH;
export const AUTH_OTP_TTL_MS = OTP_TTL_MS;
export const AUTH_OTP_MAX_ATTEMPTS = 3;
