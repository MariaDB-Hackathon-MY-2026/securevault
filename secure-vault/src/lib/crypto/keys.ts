import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto/aes";

const KEY_LENGTH = 32;
const HEX_KEY_LENGTH = KEY_LENGTH * 2;

function assert32ByteKey(key: Buffer, label: string) {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`${label} must be ${KEY_LENGTH} bytes`);
  }
}

export function getMasterKey(): Buffer {
  const masterEncryptionKey = process.env.MASTER_ENCRYPTION_KEY;

  if (!masterEncryptionKey) {
    throw new Error("MASTER_ENCRYPTION_KEY is not set");
  }

  if (!/^[0-9a-fA-F]+$/.test(masterEncryptionKey)) {
    throw new Error("MASTER_ENCRYPTION_KEY must be a valid hex string");
  }

  if (masterEncryptionKey.length !== HEX_KEY_LENGTH) {
    throw new Error("MASTER_ENCRYPTION_KEY must be a 64-character hex string");
  }

  // The env value is stored as hex text, so decode it back into the 32 raw key bytes.
  const key = Buffer.from(masterEncryptionKey, "hex");
  assert32ByteKey(key, "MASTER_ENCRYPTION_KEY");
  return key;
}

export function generateUEK(): Buffer {
  // One random 32-byte key per user.
  return randomBytes(KEY_LENGTH);
}

export function encryptUEK(uek: Buffer): Buffer {
  assert32ByteKey(uek, "UEK");
  // UEKs are wrapped with the master key before being stored in the users table.
  return encrypt(uek, getMasterKey());
}

export function decryptUEK(encryptedUek: Buffer): Buffer {
  const uek = decrypt(encryptedUek, getMasterKey());
  assert32ByteKey(uek, "Decrypted UEK");
  return uek;
}

export function generateFEK(): Buffer {
  // One random 32-byte key per file.
  return randomBytes(KEY_LENGTH);
}

export function encryptFEK(fek: Buffer, uek: Buffer): Buffer {
  assert32ByteKey(fek, "FEK");
  assert32ByteKey(uek, "UEK");
  // FEKs are wrapped with the owning user's UEK before being stored in the files table.
  return encrypt(fek, uek);
}

export function decryptFEK(encryptedFek: Buffer, uek: Buffer): Buffer {
  assert32ByteKey(uek, "UEK");
  const fek = decrypt(encryptedFek, uek);
  assert32ByteKey(fek, "Decrypted FEK");
  return fek;
}
