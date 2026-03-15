import { describe, expect, it } from "vitest";

import { validatePasswordStrength } from "@/lib/auth/password-strength";

describe("password strength", () => {
  it("rejects a weak password", () => {
    expect(validatePasswordStrength("12345678")).toEqual({
      valid: false,
      feedback: expect.any(String),
    });
  });

  it("rejects an empty password", () => {
    expect(validatePasswordStrength("")).toEqual({
      valid: false,
      feedback: expect.any(String),
    });
  });

  it("accepts a stronger password", () => {
    expect(validatePasswordStrength("CorrectHorseBatteryStaple!2026")).toEqual({
      valid: true,
      feedback: "",
    });
  });
});
