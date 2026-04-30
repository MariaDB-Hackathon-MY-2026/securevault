import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getObjectStream: vi.fn(),
}));

vi.mock("@/lib/storage/r2", () => ({
  getObjectStream: mocks.getObjectStream,
}));

import { createEncryptStream, encryptFEK, encryptUEK } from "@/lib/crypto";
import { MariadbConnection } from "@/lib/db";
import { fileChunks, files, users } from "@/lib/db/schema";
import { EmbeddingError } from "@/lib/ai/embeddings/errors";
import { readSharedFileBytes } from "@/lib/files/file-bytes";

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

function createDbHarness(options: {
  chunkRows?: Array<{ authTag: Buffer; chunkIndex: number; iv: Buffer; r2Key: string }>;
  fileRows?: Array<{
    encryptedFek: Buffer;
    mimeType: string;
    name: string;
    size: number;
    totalChunks: number;
  }>;
  ownerRows?: Array<{ encryptedUek: Buffer }>;
}) {
  const ownerLimit = vi.fn().mockResolvedValue(options.ownerRows ?? []);
  const ownerWhere = vi.fn(() => ({ limit: ownerLimit }));

  const fileLimit = vi.fn().mockResolvedValue(options.fileRows ?? []);
  const fileWhere = vi.fn(() => ({ limit: fileLimit }));

  const chunkOrderBy = vi.fn().mockResolvedValue(options.chunkRows ?? []);
  const chunkWhere = vi.fn(() => ({ orderBy: chunkOrderBy }));

  const selectFrom = vi.fn((table: unknown) => {
    if (table === users) {
      return { where: ownerWhere };
    }

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
  };
}

describe("readSharedFileBytes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MASTER_ENCRYPTION_KEY = "11".repeat(32);
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("returns bytes for a valid owner and file", async () => {
    const ownerUek = Buffer.alloc(32, 7);
    const fileFek = Buffer.alloc(32, 9);
    const chunkOne = await encryptChunk(Buffer.from("hello "), fileFek);
    const chunkTwo = await encryptChunk(Buffer.from("world"), fileFek);
    const harness = createDbHarness({
      chunkRows: [
        { authTag: chunkOne.authTag, chunkIndex: 0, iv: chunkOne.iv, r2Key: "chunk-0" },
        { authTag: chunkTwo.authTag, chunkIndex: 1, iv: chunkTwo.iv, r2Key: "chunk-1" },
      ],
      fileRows: [
        {
          encryptedFek: encryptFEK(fileFek, ownerUek),
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 11,
          totalChunks: 2,
        },
      ],
      ownerRows: [{ encryptedUek: encryptUEK(ownerUek) }],
    });

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.getObjectStream.mockImplementation(async (key: string, signal?: AbortSignal) => {
      expect(signal).toBeUndefined();

      if (key === "chunk-0") {
        return createStream([chunkOne.encrypted]);
      }

      if (key === "chunk-1") {
        return createStream([chunkTwo.encrypted]);
      }

      throw new Error(`Unexpected chunk key ${key}`);
    });

    const result = await readSharedFileBytes({
      fileId: "file-1",
      ownerId: "owner-1",
    });

    expect(result?.bytes).toEqual(Buffer.from("hello world"));
    expect(result?.file.mimeType).toBe("application/pdf");
    expect(result?.ownerUek.equals(ownerUek)).toBe(true);
  });

  it("returns null for a missing owner", async () => {
    const harness = createDbHarness({ ownerRows: [] });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      readSharedFileBytes({
        fileId: "file-1",
        ownerId: "owner-1",
      }),
    ).resolves.toBeNull();
  });

  it("returns null for a missing file", async () => {
    const ownerUek = Buffer.alloc(32, 7);
    const harness = createDbHarness({
      fileRows: [],
      ownerRows: [{ encryptedUek: encryptUEK(ownerUek) }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      readSharedFileBytes({
        fileId: "file-1",
        ownerId: "owner-1",
      }),
    ).resolves.toBeNull();
  });

  it("throws for incomplete chunks", async () => {
    const ownerUek = Buffer.alloc(32, 7);
    const fileFek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("hello"), fileFek);
    const harness = createDbHarness({
      chunkRows: [{ authTag: chunk.authTag, chunkIndex: 0, iv: chunk.iv, r2Key: "chunk-0" }],
      fileRows: [
        {
          encryptedFek: encryptFEK(fileFek, ownerUek),
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 5,
          totalChunks: 2,
        },
      ],
      ownerRows: [{ encryptedUek: encryptUEK(ownerUek) }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      readSharedFileBytes({
        fileId: "file-1",
        ownerId: "owner-1",
      }),
    ).rejects.toThrowError(
      new EmbeddingError("R2_READ_FAILED", "File chunk metadata is incomplete."),
    );
  });

  it("throws for inconsistent chunk indexes", async () => {
    const ownerUek = Buffer.alloc(32, 7);
    const fileFek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("hello"), fileFek);
    const harness = createDbHarness({
      chunkRows: [{ authTag: chunk.authTag, chunkIndex: 1, iv: chunk.iv, r2Key: "chunk-0" }],
      fileRows: [
        {
          encryptedFek: encryptFEK(fileFek, ownerUek),
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 5,
          totalChunks: 1,
        },
      ],
      ownerRows: [{ encryptedUek: encryptUEK(ownerUek) }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      readSharedFileBytes({
        fileId: "file-1",
        ownerId: "owner-1",
      }),
    ).rejects.toThrowError(
      new EmbeddingError("R2_READ_FAILED", "File chunk metadata is inconsistent."),
    );
  });

  it("throws a stable error for FEK decrypt failures", async () => {
    const ownerUek = Buffer.alloc(32, 7);
    const wrongUek = Buffer.alloc(32, 8);
    const fileFek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("hello"), fileFek);
    const harness = createDbHarness({
      chunkRows: [{ authTag: chunk.authTag, chunkIndex: 0, iv: chunk.iv, r2Key: "chunk-0" }],
      fileRows: [
        {
          encryptedFek: encryptFEK(fileFek, wrongUek),
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 5,
          totalChunks: 1,
        },
      ],
      ownerRows: [{ encryptedUek: encryptUEK(ownerUek) }],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      readSharedFileBytes({
        fileId: "file-1",
        ownerId: "owner-1",
      }),
    ).rejects.toThrowError(
      new EmbeddingError("DECRYPT_FAILED", "Failed to decrypt the file encryption key."),
    );
  });

  it("passes the abort signal to R2 reads", async () => {
    const ownerUek = Buffer.alloc(32, 7);
    const fileFek = Buffer.alloc(32, 9);
    const chunk = await encryptChunk(Buffer.from("hello"), fileFek);
    const harness = createDbHarness({
      chunkRows: [{ authTag: chunk.authTag, chunkIndex: 0, iv: chunk.iv, r2Key: "chunk-0" }],
      fileRows: [
        {
          encryptedFek: encryptFEK(fileFek, ownerUek),
          mimeType: "application/pdf",
          name: "report.pdf",
          size: 5,
          totalChunks: 1,
        },
      ],
      ownerRows: [{ encryptedUek: encryptUEK(ownerUek) }],
    });
    const abortController = new AbortController();
    let seenSignal: AbortSignal | undefined;

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.getObjectStream.mockImplementation(async (_key: string, signal?: AbortSignal) => {
      seenSignal = signal;
      return createStream([chunk.encrypted]);
    });

    await readSharedFileBytes({
      fileId: "file-1",
      ownerId: "owner-1",
      signal: abortController.signal,
    });

    expect(seenSignal).toBe(abortController.signal);
  });
});
