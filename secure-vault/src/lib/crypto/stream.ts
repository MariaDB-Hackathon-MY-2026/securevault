import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  AES_256_GCM_ALGORITHM,
  AES_GCM_AUTH_TAG_LENGTH_BYTES,
  AES_GCM_IV_LENGTH_BYTES,
  ENCRYPTION_KEY_LENGTH_BYTES,
} from "@/lib/constants";

export type EncryptStream = {
  stream: TransformStream<Uint8Array, Uint8Array>;
  getIV: () => Buffer;
  getAuthTag: () => Buffer;
};

function assertKeyLength(key: Buffer) {
  if (key.length !== ENCRYPTION_KEY_LENGTH_BYTES) {
    throw new Error(`Key must be ${ENCRYPTION_KEY_LENGTH_BYTES} bytes`);
  }
}

function assertIvLength(iv: Buffer) {
  if (iv.length !== AES_GCM_IV_LENGTH_BYTES) {
    throw new Error(`IV must be ${AES_GCM_IV_LENGTH_BYTES} bytes`);
  }
}

function assertAuthTagLength(authTag: Buffer) {
  if (authTag.length !== AES_GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new Error(`Auth tag must be ${AES_GCM_AUTH_TAG_LENGTH_BYTES} bytes`);
  }
}

export function createEncryptStream(key: Buffer): EncryptStream {
  assertKeyLength(key);

  const iv = randomBytes(AES_GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv(AES_256_GCM_ALGORITHM, key, iv);
  let authTag: Buffer | null = null;
  let finished = false;

  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Each incoming plaintext chunk is encrypted and pushed onward immediately.
      const encrypted = cipher.update(Buffer.from(chunk));
      if (encrypted.length > 0) {
        controller.enqueue(new Uint8Array(encrypted));
      }
    },
    flush(controller) {
      // flush() is the end-of-stream hook where GCM finalizes and exposes the auth tag.
      const finalChunk = cipher.final();
      if (finalChunk.length > 0) {
        controller.enqueue(new Uint8Array(finalChunk));
      }

      authTag = cipher.getAuthTag();
      finished = true;
    },
  });

  return {
    stream,
    // IV is available immediately because it is generated when the stream is created.
    getIV: () => Buffer.from(iv),
    getAuthTag: () => {
      if (!finished || !authTag) {
        throw new Error("Auth tag is not available until the stream is fully consumed");
      }

      return Buffer.from(authTag);
    },
  };
}

export function createDecryptStream(
  key: Buffer,
  iv: Buffer,
  authTag: Buffer,
): TransformStream<Uint8Array, Uint8Array> {
  assertKeyLength(key);
  assertIvLength(iv);
  assertAuthTagLength(authTag);

  const decipher = createDecipheriv(AES_256_GCM_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const decrypted = decipher.update(Buffer.from(chunk));
      if (decrypted.length > 0) {
        controller.enqueue(new Uint8Array(decrypted));
      }
    },
    flush(controller) {
      // If the key, IV, auth tag, or ciphertext is wrong, decipher.final() will throw here.
      const finalChunk = decipher.final();
      if (finalChunk.length > 0) {
        controller.enqueue(new Uint8Array(finalChunk));
      }
    },
  });
}
