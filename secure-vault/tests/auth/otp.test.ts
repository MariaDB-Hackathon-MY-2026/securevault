import { describe, expect, it } from "vitest";

import {
  __resetAuthOtpIdStateForTests,
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

  it("creates lexically increasing ids for tokens created in the same millisecond", () => {
    __resetAuthOtpIdStateForTests();

    const firstId = createAuthOtpId(1_800_000_000_000);
    const secondId = createAuthOtpId(1_800_000_000_000);

    expect(firstId < secondId).toBe(true);
  });
});
