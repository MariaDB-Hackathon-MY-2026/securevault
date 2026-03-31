import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getObjectStream: vi.fn(),
}));

vi.mock("@/lib/storage/r2", () => ({
  getObjectStream: mocks.getObjectStream,
}));

import { createEncryptStream, encryptFEK } from "@/lib/crypto";
import { MariadbConnection } from "@/lib/db";
import { fileChunks, files } from "@/lib/db/schema";
import { FileDownloadServiceError, streamOwnedFile } from "@/lib/files/download-service";

function createUser() {
  return {
    created_at: new Date("2026-03-20T00:00:00.000Z"),
    email: "alice@example.com",
    email_verified: true,
    id: "user-1",
    name: "Alice",
    storage_quota: 1024,
    storage_used: 0,
    uek: Buffer.alloc(32, 7),
  };
}

function createStream(chunks: Array<Uint8Array | Buffer>) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
      }

      controller.close();
    },
  });
}

async function collectStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

async function encryptChunk(plaintext: Buffer, key: Buffer) {
  const encryptor = createEncryptStream(key);
  const encrypted = await collectStream(createStream([plaintext]).pipeThrough(encryptor.stream));

  return {
    authTag: encryptor.getAuthTag(),
    encrypted,
    iv: encryptor.getIV(),
  };
}

function createDownloadDbHarness(options: {
  chunkRows: Array<{
    authTag: Buffer;
    chunkIndex: number;
    iv: Buffer;
    r2Key: string;
  }>;
  fileRows: Array<{
    encryptedFek: Buffer;
    mimeType: string;
    name: string;
    size: number;
    totalChunks: number;
  }>;
}) {
  const fileLimit = vi.fn().mockResolvedValue(options.fileRows);
  const fileWhere = vi.fn(() => ({ limit: fileLimit }));

  const chunkOrderBy = vi.fn().mockResolvedValue(options.chunkRows);
  const chunkWhere = vi.fn(() => ({ orderBy: chunkOrderBy }));

  const selectFrom = vi.fn((table: unknown) => {
    if (table === files) {
      return { where: fileWhere };
    }

    if (table === fileChunks) {
      return { where: chunkWhere };
    }

    throw new Error("Unexpected table in select.from");
  });

  return {
    db: {
      select: vi.fn(() => ({ from: selectFrom })),
    },
    spies: {
      chunkOrderBy,
      chunkWhere,
      fileLimit,
      fileWhere,
      selectFrom,
    },
  };
}

describe("download service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("streams decrypted bytes and sets attachment headers", async () => {
    const user = createUser();
    const fek = Buffer.alloc(32, 9);
    const chunkOne = await encryptChunk(Buffer.from("hello "), fek);
    const chunkTwo = await encryptChunk(Buffer.from("world"), fek);
    const harness = createDownloadDbHarness({
      chunkRows: [
        {
          authTag: chunkOne.authTag,
          chunkIndex: 0,
          iv: chunkOne.iv,
          r2Key: "chunk-0",
        },
        {
          authTag: chunkTwo.authTag,
          chunkIndex: 1,
          iv: chunkTwo.iv,
          r2Key: "chunk-1",
        },
      ],
      fileRows: [
        {
          encryptedFek: encryptFEK(fek, user.uek),
          mimeType: "application/pdf",
          name: "Quarterly report.pdf",
          size: 11,
          totalChunks: 2,
        },
      ],
    });

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.getObjectStream.mockImplementation(async (key: string) => {
      if (key === "chunk-0") {
        return createStream([chunkOne.encrypted]);
      }

      if (key === "chunk-1") {
        return createStream([chunkTwo.encrypted]);
      }

      throw new Error(`Unexpected chunk key ${key}`);
    });

    const response = await streamOwnedFile({
      disposition: "attachment",
      fileId: "file-1",
      user,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Length")).toBe("11");
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    const body = await collectStream(response.body!);
    expect(body).toEqual(Buffer.from("hello world"));
    expect(body.byteLength).toBe(Number(response.headers.get("Content-Length")));
  });

  it("rejects inline preview for unsupported mime types", async () => {
    const user = createUser();
    const fek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("binary"), fek);
    const harness = createDownloadDbHarness({
      chunkRows: [
        {
          authTag: chunk.authTag,
          chunkIndex: 0,
          iv: chunk.iv,
          r2Key: "chunk-0",
        },
      ],
      fileRows: [
        {
          encryptedFek: encryptFEK(fek, user.uek),
          mimeType: "application/octet-stream",
          name: "archive.bin",
          size: 6,
          totalChunks: 1,
        },
      ],
    });

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      streamOwnedFile({
        disposition: "inline",
        fileId: "file-1",
        user,
      }),
    ).rejects.toThrowError(
      new FileDownloadServiceError("Preview is not supported for this file type", 415),
    );
    expect(mocks.getObjectStream).not.toHaveBeenCalled();
  });

  it("fails fast when chunk metadata is incomplete", async () => {
    const user = createUser();
    const fek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("hello"), fek);
    const harness = createDownloadDbHarness({
      chunkRows: [
        {
          authTag: chunk.authTag,
          chunkIndex: 0,
          iv: chunk.iv,
          r2Key: "chunk-0",
        },
      ],
      fileRows: [
        {
          encryptedFek: encryptFEK(fek, user.uek),
          mimeType: "application/pdf",
          name: "demo.pdf",
          size: 5,
          totalChunks: 2,
        },
      ],
    });

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      streamOwnedFile({
        disposition: "attachment",
        fileId: "file-1",
        user,
      }),
    ).rejects.toThrowError(
      new FileDownloadServiceError("File chunk metadata is incomplete", 500),
    );
    expect(mocks.getObjectStream).not.toHaveBeenCalled();
  });

  it("encodes non-ascii filenames safely in content disposition", async () => {
    const user = createUser();
    const fek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("hello"), fek);
    const harness = createDownloadDbHarness({
      chunkRows: [
        {
          authTag: chunk.authTag,
          chunkIndex: 0,
          iv: chunk.iv,
          r2Key: "chunk-0",
        },
      ],
      fileRows: [
        {
          encryptedFek: encryptFEK(fek, user.uek),
          mimeType: "application/pdf",
          name: 'résumé "Q1".pdf',
          size: 5,
          totalChunks: 1,
        },
      ],
    });

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.getObjectStream.mockResolvedValue(createStream([chunk.encrypted]));

    const response = await streamOwnedFile({
      disposition: "attachment",
      fileId: "file-utf8",
      user,
    });

    expect(response.headers.get("Content-Disposition")).toContain('filename="r_sum_ Q1.pdf"');
    expect(response.headers.get("Content-Disposition")).toContain(
      "filename*=UTF-8''r%C3%A9sum%C3%A9%20Q1.pdf",
    );
  });

  it("errors the response stream when ciphertext is tampered", async () => {
    const user = createUser();
    const fek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("hello world"), fek);
    const corrupted = Buffer.from(chunk.encrypted);
    corrupted[corrupted.length - 1] ^= 0xff;
    const harness = createDownloadDbHarness({
      chunkRows: [
        {
          authTag: chunk.authTag,
          chunkIndex: 0,
          iv: chunk.iv,
          r2Key: "chunk-0",
        },
      ],
      fileRows: [
        {
          encryptedFek: encryptFEK(fek, user.uek),
          mimeType: "application/pdf",
          name: "tampered.pdf",
          size: 11,
          totalChunks: 1,
        },
      ],
    });

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.getObjectStream.mockResolvedValue(createStream([corrupted]));

    const response = await streamOwnedFile({
      disposition: "attachment",
      fileId: "file-tampered",
      user,
    });

    await expect(collectStream(response.body!)).rejects.toThrow("Failed to stream file");
  });
  it("forwards the request abort signal to the underlying chunk fetch", async () => {
    const user = createUser();
    const fek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("hello"), fek);
    const harness = createDownloadDbHarness({
      chunkRows: [
        {
          authTag: chunk.authTag,
          chunkIndex: 0,
          iv: chunk.iv,
          r2Key: "chunk-0",
        },
      ],
      fileRows: [
        {
          encryptedFek: encryptFEK(fek, user.uek),
          mimeType: "application/pdf",
          name: "abort.pdf",
          size: 5,
          totalChunks: 1,
        },
      ],
    });
    const abortController = new AbortController();
    let receivedSignal: AbortSignal | undefined;

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.getObjectStream.mockImplementation(async (_key: string, signal?: AbortSignal) => {
      receivedSignal = signal;

      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk.encrypted);
        },
      });
    });

    const response = await streamOwnedFile({
      disposition: "attachment",
      fileId: "file-abort",
      user,
      signal: abortController.signal,
    });

    abortController.abort(new DOMException("Aborted", "AbortError"));
    await response.body?.cancel("client aborted");

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal?.aborted).toBe(true);
  });
});




