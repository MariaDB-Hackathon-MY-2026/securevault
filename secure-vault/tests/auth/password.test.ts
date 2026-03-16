import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password auth", () => {
  it("hashes and verifies a correct password", async () => {
    const password = "CorrectHorseBatteryStaple!2026";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple!2026");

    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("password", "not-an-argon2-hash")).rejects.toThrow();
  });
});
