import { describe, expect, it } from "vitest";

import { validatePasswordStrength } from "@/lib/auth/password-strength";

describe("password strength", () => {
  it("rejects a weak password", () => {
    expect(validatePasswordStrength("12345678")).toMatchObject({
      strength: expect.any(Number),
      valid: false,
      feedback: expect.any(String),
    });
  });

  it("rejects an empty password", () => {
    expect(validatePasswordStrength("")).toMatchObject({
      strength: expect.any(Number),
      valid: false,
      feedback: expect.any(String),
    });
  });

  it("accepts a stronger password", () => {
    expect(validatePasswordStrength("CorrectHorseBatteryStaple!2026")).toMatchObject({
      strength: 4,
      valid: true,
      feedback: "",
    });
  });
});
