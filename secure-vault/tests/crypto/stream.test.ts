import { randomBytes } from "node:crypto";
import { createDecryptStream, createEncryptStream } from "@/lib/crypto/stream";

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe("stream crypto", () => {
  it("round-trips stream encryption and decryption", async () => {
    const key = randomBytes(32);
    const plaintext = Buffer.from("stream me safely across the wire");
    const { stream, getIV, getAuthTag } = createEncryptStream(key);

    const encrypted = await collectStream(streamFromChunks([plaintext]).pipeThrough(stream));
    const decrypted = await collectStream(
      streamFromChunks([encrypted]).pipeThrough(createDecryptStream(key, getIV(), getAuthTag())),
    );

    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it("only exposes the auth tag after the stream is consumed", () => {
    const { getAuthTag } = createEncryptStream(randomBytes(32));

    expect(() => getAuthTag()).toThrow("Auth tag is not available until the stream is fully consumed");
  });

  it("throws when decrypting with the wrong key", async () => {
    const key = randomBytes(32);
    const wrongKey = randomBytes(32);
    const plaintext = Buffer.from("wrong key should fail");
    const { stream, getIV, getAuthTag } = createEncryptStream(key);
    const encrypted = await collectStream(streamFromChunks([plaintext]).pipeThrough(stream));

    await expect(
      collectStream(
        streamFromChunks([encrypted]).pipeThrough(createDecryptStream(wrongKey, getIV(), getAuthTag())),
      ),
    ).rejects.toThrow();
  });
});
