import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto/aes";

describe("aes", () => {
  it("encrypts and decrypts a payload", () => {
    const key = randomBytes(32);
    const data = Buffer.from("hello secure vault");

    const encrypted = encrypt(data, key);
    const decrypted = decrypt(encrypted, key);

    expect(decrypted.equals(data)).toBe(true);
  });

  it("throws when using the wrong key", () => {
    const data = Buffer.from("top secret");
    const encrypted = encrypt(data, randomBytes(32));

    expect(() => decrypt(encrypted, randomBytes(32))).toThrow("Failed to decrypt payload");
  });

  it("throws when ciphertext is tampered with", () => {
    const key = randomBytes(32);
    const encrypted = encrypt(Buffer.from("sensitive"), key);
    const tampered = Buffer.from(encrypted);

    tampered[tampered.length - 1] ^= 1;

    expect(() => decrypt(tampered, key)).toThrow("Failed to decrypt payload");
  });

  it("handles empty payloads", () => {
    const key = randomBytes(32);
    const encrypted = encrypt(Buffer.alloc(0), key);
    const decrypted = decrypt(encrypted, key);

    expect(decrypted.equals(Buffer.alloc(0))).toBe(true);
  });
});
