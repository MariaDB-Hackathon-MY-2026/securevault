import { createHash, randomInt } from "node:crypto";

import { nanoid } from "nanoid";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
let lastOtpIdTimestamp = 0;
let otpIdSequence = 0;

export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function createOtpExpiry(now = new Date()) {
  return new Date(now.getTime() + OTP_TTL_MS);
}

export function createAuthOtpId(now = Date.now()) {
  if (now === lastOtpIdTimestamp) {
    otpIdSequence += 1;
  } else {
    lastOtpIdTimestamp = now;
    otpIdSequence = 0;
  }

  const prefix = now.toString(36).padStart(8, "0");
  const sequence = otpIdSequence.toString(36).padStart(2, "0");

  return `${prefix}${sequence}${nanoid(11)}`;
}

export const AUTH_OTP_LENGTH = OTP_LENGTH;
export const AUTH_OTP_TTL_MS = OTP_TTL_MS;
export const AUTH_OTP_MAX_ATTEMPTS = 3;

export function __resetAuthOtpIdStateForTests() {
  lastOtpIdTimestamp = 0;
  otpIdSequence = 0;
}
