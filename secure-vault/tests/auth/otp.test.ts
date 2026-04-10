import { describe, expect, it } from "vitest";

import {
  createAuthOtpId,
  generateOtpCode,
  hashOtpCode,
  normalizeEmailAddress,
} from "@/lib/auth/otp";

describe("auth otp helpers", () => {
  it("generates six-digit codes", () => {
    const code = generateOtpCode();

    expect(code).toMatch(/^\d{6}$/);
  });

  it("normalizes emails and hashes OTP codes", () => {
    expect(normalizeEmailAddress(" Alice@Example.com ")).toBe("alice@example.com");
    expect(hashOtpCode("123456")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates fixed-length ids without shared mutable state", () => {
    const firstId = createAuthOtpId();
    const secondId = createAuthOtpId();

    expect(firstId).toHaveLength(21);
    expect(secondId).toHaveLength(21);
    expect(firstId).not.toBe(secondId);
  });
});
