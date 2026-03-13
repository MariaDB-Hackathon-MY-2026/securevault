import {
  decryptFEK,
  decryptUEK,
  encryptFEK,
  encryptUEK,
  generateFEK,
  generateUEK,
  getMasterKey,
} from "@/lib/crypto/keys";

describe("keys", () => {
  const originalMasterKey = process.env.MASTER_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.MASTER_ENCRYPTION_KEY = "11".repeat(32);
  });

  afterAll(() => {
    if (originalMasterKey === undefined) {
      delete process.env.MASTER_ENCRYPTION_KEY;
      return;
    }

    process.env.MASTER_ENCRYPTION_KEY = originalMasterKey;
  });

  it("encrypts and decrypts UEKs with the master key", () => {
    const uek = generateUEK();
    const encrypted = encryptUEK(uek);
    const decrypted = decryptUEK(encrypted);

    expect(decrypted.equals(uek)).toBe(true);
  });

  it("encrypts and decrypts FEKs with the UEK", () => {
    const uek = generateUEK();
    const fek = generateFEK();
    const encrypted = encryptFEK(fek, uek);
    const decrypted = decryptFEK(encrypted, uek);

    expect(decrypted.equals(fek)).toBe(true);
  });

  it("throws when decrypting a FEK with the wrong UEK", () => {
    const encrypted = encryptFEK(generateFEK(), generateUEK());

    expect(() => decryptFEK(encrypted, generateUEK())).toThrow("Failed to decrypt payload");
  });

  it("throws a clear error when the env var is missing", () => {
    delete process.env.MASTER_ENCRYPTION_KEY;

    expect(() => getMasterKey()).toThrow("MASTER_ENCRYPTION_KEY is not set");
  });

  it("throws when the env var is not valid hex", () => {
    process.env.MASTER_ENCRYPTION_KEY = "z".repeat(64);

    expect(() => getMasterKey()).toThrow("MASTER_ENCRYPTION_KEY must be a valid hex string");
  });

  it("throws when the env var is the wrong length", () => {
    process.env.MASTER_ENCRYPTION_KEY = "11".repeat(31);

    expect(() => getMasterKey()).toThrow("MASTER_ENCRYPTION_KEY must be a 64-character hex string");
  });
});
