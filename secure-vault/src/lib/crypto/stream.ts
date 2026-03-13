import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptStream = {
  stream: TransformStream<Uint8Array, Uint8Array>;
  getIV: () => Buffer;
  getAuthTag: () => Buffer;
};

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function assertKeyLength(key: Buffer) {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes`);
  }
}

function assertIvLength(iv: Buffer) {
  if (iv.length !== IV_LENGTH) {
    throw new Error(`IV must be ${IV_LENGTH} bytes`);
  }
}

function assertAuthTagLength(authTag: Buffer) {
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Auth tag must be ${AUTH_TAG_LENGTH} bytes`);
  }
}

export function createEncryptStream(key: Buffer): EncryptStream {
  assertKeyLength(key);

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
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

  const decipher = createDecipheriv(ALGORITHM, key, iv);
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
