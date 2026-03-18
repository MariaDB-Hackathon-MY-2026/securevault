import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  AES_256_GCM_ALGORITHM,
  AES_GCM_AUTH_TAG_LENGTH_BYTES,
  AES_GCM_IV_LENGTH_BYTES,
  ENCRYPTION_KEY_LENGTH_BYTES,
} from "@/lib/constants";

function assertKeyLength(key: Buffer) {
  if (key.length !== ENCRYPTION_KEY_LENGTH_BYTES) {
    throw new Error(
      `Invalid key length: expected ${ENCRYPTION_KEY_LENGTH_BYTES} bytes, got ${key.length}`,
    );
  }
}

export function encrypt(data: Buffer, key: Buffer): Buffer {
  assertKeyLength(key);

  // AES-GCM works best with a fresh 12-byte IV for every encryption operation.
  const iv = randomBytes(AES_GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv(AES_256_GCM_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Packed payload format: [12-byte IV][16-byte auth tag][ciphertext].
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decrypt(payload: Buffer, key: Buffer): Buffer {
  assertKeyLength(key);

  if (payload.length < AES_GCM_IV_LENGTH_BYTES + AES_GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new Error("Encrypted payload is too short");
  }

  // Split the packed payload back into its fixed-size metadata and variable ciphertext.
  const iv = payload.subarray(0, AES_GCM_IV_LENGTH_BYTES);
  const authTag = payload.subarray(
    AES_GCM_IV_LENGTH_BYTES,
    AES_GCM_IV_LENGTH_BYTES + AES_GCM_AUTH_TAG_LENGTH_BYTES,
  );
  const ciphertext = payload.subarray(
    AES_GCM_IV_LENGTH_BYTES + AES_GCM_AUTH_TAG_LENGTH_BYTES,
  );

  const decipher = createDecipheriv(AES_256_GCM_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Failed to decrypt payload");
  }
}
