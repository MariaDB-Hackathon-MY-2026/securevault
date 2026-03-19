import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildR2Key: vi.fn(),
  deleteObject: vi.fn(),
  fileTypeFromBuffer: vi.fn(),
  nanoid: vi.fn(),
  putObjectStream: vi.fn(),
}));

vi.mock("file-type", () => ({
  fileTypeFromBuffer: mocks.fileTypeFromBuffer,
}));

vi.mock("nanoid", () => ({
  nanoid: mocks.nanoid,
}));

vi.mock("@/lib/storage/r2", () => ({
  buildR2Key: mocks.buildR2Key,
  deleteObject: mocks.deleteObject,
  putObjectStream: mocks.putObjectStream,
}));

import { encryptFEK } from "@/lib/crypto";
import { MariadbConnection } from "@/lib/db";
import { fileChunks, files, uploadSessions } from "@/lib/db/schema";
import {
  buildUploadChunkLockName,
  UploadChunkServiceError,
  parseChunkHeaders,
  uploadChunk,
} from "@/app/api/upload/chunk/service";

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

function createDbHarness(options?: {
  existingChunk?: Array<{ id: string }>;
  lockAcquired?: number;
  persistError?: Error;
  session?: Array<{
    encryptedFek: Buffer;
    fileId: string;
    totalChunks: number;
    uploadId: string;
  }>;
}) {
  const sessionLimit = vi.fn().mockResolvedValue(options?.session ?? []);
  const sessionWhere = vi.fn(() => ({ limit: sessionLimit }));
  const sessionInnerJoin = vi.fn(() => ({ where: sessionWhere }));

  const chunkLimit = vi.fn().mockResolvedValue(options?.existingChunk ?? []);
  const chunkWhere = vi.fn(() => ({ limit: chunkLimit }));

  const selectFrom = vi.fn((table: unknown) => {
    if (table === uploadSessions) {
      return { innerJoin: sessionInnerJoin };
    }

    if (table === fileChunks) {
      return { where: chunkWhere };
    }

    throw new Error("Unexpected table in select.from");
  });
  const select = vi.fn(() => ({ from: selectFrom }));

  const fileChunkValues = vi.fn(async () => {
    if (options?.persistError) {
      throw options.persistError;
    }
  });
  const insert = vi.fn((table: unknown) => {
    if (table === fileChunks) {
      return { values: fileChunkValues };
    }

    throw new Error("Unexpected table in insert");
  });

  const uploadSessionWhere = vi.fn(async () => undefined);
  const uploadSessionSet = vi.fn(() => ({ where: uploadSessionWhere }));
  const fileWhere = vi.fn(async () => undefined);
  const fileSet = vi.fn(() => ({ where: fileWhere }));

  const update = vi.fn((table: unknown) => {
    if (table === uploadSessions) {
      return { set: uploadSessionSet };
    }

    if (table === files) {
      return { set: fileSet };
    }

    throw new Error("Unexpected table in update");
  });

  const execute = vi
    .fn()
    .mockResolvedValueOnce([{ acquired: options?.lockAcquired ?? 1 }])
    .mockResolvedValue([{ released: 1 }]);

  const tx = {
    execute,
    insert,
    select,
    update,
  };

  const db = {
    transaction: vi.fn((callback: (transaction: unknown) => Promise<unknown>) => callback(tx)),
  };

  return {
    db,
    spies: {
      dbTransaction: db.transaction,
      execute,
      fileChunkValues,
      fileSet,
      fileWhere,
      insert,
      select,
      selectFrom,
      sessionInnerJoin,
      sessionLimit,
      sessionWhere,
      update,
      uploadSessionSet,
      uploadSessionWhere,
    },
  };
}

describe("upload chunk service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });

    mocks.buildR2Key.mockImplementation((userId: string, fileId: string, chunkIndex: number) => {
      return `${userId}/files/${fileId}/chunk_${chunkIndex}`;
    });
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.fileTypeFromBuffer.mockResolvedValue({ ext: "pdf", mime: "application/pdf" });
    mocks.nanoid.mockReturnValue("chunk-record-1");
    mocks.putObjectStream.mockImplementation(async (_key: string, stream: ReadableStream<Uint8Array>) => {
      await collectStream(stream);
    });
  });

  it("builds a deterministic advisory lock name", () => {
    expect(buildUploadChunkLockName("upload-1", 4)).toBe("upload:chunk:upload-1:4");
  });

  it("parses valid chunk headers", () => {
    expect(
      parseChunkHeaders(
        new Headers({
          "x-chunk-index": "5",
          "x-upload-id": "upload-1",
        }),
      ),
    ).toEqual({
      chunkIndex: 5,
      uploadId: "upload-1",
    });
  });

  it("rejects missing upload ids", () => {
    expect(() =>
      parseChunkHeaders(
        new Headers({
          "x-chunk-index": "0",
        }),
      ),
    ).toThrowError(new UploadChunkServiceError("x-upload-id header is required", 400));
  });

  it("rejects invalid chunk indexes", () => {
    expect(() =>
      parseChunkHeaders(
        new Headers({
          "x-chunk-index": "1.5",
          "x-upload-id": "upload-1",
        }),
      ),
    ).toThrowError(
      new UploadChunkServiceError("x-chunk-index header must be a non-negative integer", 400),
    );
  });

  it("rejects requests without a body", async () => {
    await expect(
      uploadChunk({
        body: null,
        headers: new Headers({
          "x-chunk-index": "0",
          "x-upload-id": "upload-1",
        }),
        user: createUser(),
      }),
    ).rejects.toMatchObject({
      message: "Chunk request body is required",
      status: 400,
    });
  });

  it("returns a conflict when the per-chunk advisory lock cannot be acquired", async () => {
    const harness = createDbHarness({ lockAcquired: 0 });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      uploadChunk({
        body: createStream([Buffer.from("chunk")]),
        headers: new Headers({
          "x-chunk-index": "0",
          "x-upload-id": "upload-1",
        }),
        user: createUser(),
      }),
    ).rejects.toMatchObject({
      message: "Chunk upload is already in progress. Please retry.",
      status: 409,
    });

    expect(harness.spies.execute).toHaveBeenCalledTimes(1);
    expect(mocks.putObjectStream).not.toHaveBeenCalled();
  });

  it("rejects missing or expired upload sessions", async () => {
    const harness = createDbHarness();
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      uploadChunk({
        body: createStream([Buffer.from("chunk")]),
        headers: new Headers({
          "x-chunk-index": "0",
          "x-upload-id": "upload-1",
        }),
        user: createUser(),
      }),
    ).rejects.toMatchObject({
      message: "Upload session not found or expired",
      status: 404,
    });

    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
    expect(mocks.putObjectStream).not.toHaveBeenCalled();
  });

  it("rejects chunk indexes outside the upload session range", async () => {
    const user = createUser();
    const harness = createDbHarness({
      session: [
        {
          encryptedFek: encryptFEK(Buffer.alloc(32, 2), user.uek),
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      uploadChunk({
        body: createStream([Buffer.from("chunk")]),
        headers: new Headers({
          "x-chunk-index": "2",
          "x-upload-id": "upload-1",
        }),
        user,
      }),
    ).rejects.toMatchObject({
      message: "Chunk index is out of range",
      status: 400,
    });

    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects already uploaded chunks for the current file", async () => {
    const user = createUser();
    const harness = createDbHarness({
      existingChunk: [{ id: "chunk-row-1" }],
      session: [
        {
          encryptedFek: encryptFEK(Buffer.alloc(32, 2), user.uek),
          fileId: "file-1",
          totalChunks: 3,
          uploadId: "upload-1",
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      uploadChunk({
        body: createStream([Buffer.from("chunk")]),
        headers: new Headers({
          "x-chunk-index": "1",
          "x-upload-id": "upload-1",
        }),
        user,
      }),
    ).rejects.toMatchObject({
      message: "Chunk already uploaded",
      status: 409,
    });

    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
    expect(mocks.putObjectStream).not.toHaveBeenCalled();
  });

  it("detects the MIME type from the first 4KB, uploads a stream, and persists IV plus auth tag", async () => {
    const user = createUser();
    const originalFirstChunk = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(5000, 1)]);
    const originalRemainder = Buffer.from("rest-of-the-file");
    const harness = createDbHarness({
      session: [
        {
          encryptedFek: encryptFEK(Buffer.alloc(32, 2), user.uek),
          fileId: "file-1",
          totalChunks: 3,
          uploadId: "upload-1",
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    let uploadedBytes = Buffer.alloc(0);
    mocks.putObjectStream.mockImplementationOnce(
      async (_key: string, stream: ReadableStream<Uint8Array>) => {
        expect(typeof stream.getReader).toBe("function");
        uploadedBytes = await collectStream(stream);
      },
    );

    const result = await uploadChunk({
      body: createStream([originalFirstChunk, originalRemainder]),
      headers: new Headers({
        "x-chunk-index": "0",
        "x-upload-id": "upload-1",
      }),
      user,
    });

    expect(result).toEqual({
      chunkIndex: 0,
      status: "uploaded",
    });
    expect(mocks.fileTypeFromBuffer).toHaveBeenCalledTimes(1);
    const sniffBuffer = mocks.fileTypeFromBuffer.mock.calls[0][0] as Buffer;
    expect(sniffBuffer.length).toBe(4096);
    expect(sniffBuffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(mocks.putObjectStream).toHaveBeenCalledWith(
      "user-1/files/file-1/chunk_0",
      expect.any(Object),
    );
    expect(uploadedBytes.equals(Buffer.concat([originalFirstChunk, originalRemainder]))).toBe(
      false,
    );
    expect(harness.spies.fileChunkValues).toHaveBeenCalledWith({
      auth_tag: expect.any(Buffer),
      chunk_index: 0,
      file_id: "file-1",
      id: "chunk-record-1",
      iv: expect.any(Buffer),
      r2_key: "user-1/files/file-1/chunk_0",
    });
    const insertedChunkCall = harness.spies.fileChunkValues.mock.calls.at(0) as
      | [
          {
            auth_tag: Buffer;
            iv: Buffer;
          },
        ]
      | undefined;
    const insertedChunk = insertedChunkCall?.[0];
    expect(insertedChunk?.iv.length).toBe(12);
    expect(insertedChunk?.auth_tag.length).toBe(16);
    expect(harness.spies.uploadSessionSet).toHaveBeenCalledWith({
      completed_chunks: expect.anything(),
    });
    expect(harness.spies.fileSet).toHaveBeenCalledWith({
      mime_type: "application/pdf",
    });
    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
    expect(harness.spies.dbTransaction).toHaveBeenCalledTimes(1);
  });

  it("skips MIME detection and file MIME updates for non-first chunks", async () => {
    const user = createUser();
    const harness = createDbHarness({
      session: [
        {
          encryptedFek: encryptFEK(Buffer.alloc(32, 2), user.uek),
          fileId: "file-1",
          totalChunks: 3,
          uploadId: "upload-1",
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await uploadChunk({
      body: createStream([Buffer.from("middle-chunk-data")]),
      headers: new Headers({
        "x-chunk-index": "1",
        "x-upload-id": "upload-1",
      }),
      user,
    });

    expect(result).toEqual({
      chunkIndex: 1,
      status: "uploaded",
    });
    expect(mocks.fileTypeFromBuffer).not.toHaveBeenCalled();
    expect(harness.spies.fileSet).not.toHaveBeenCalled();
    expect(harness.spies.fileChunkValues).toHaveBeenCalledTimes(1);
    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects unrecognized first-chunk MIME types", async () => {
    const user = createUser();
    const harness = createDbHarness({
      session: [
        {
          encryptedFek: encryptFEK(Buffer.alloc(32, 2), user.uek),
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.fileTypeFromBuffer.mockResolvedValueOnce(undefined);

    await expect(
      uploadChunk({
        body: createStream([Buffer.from("not-a-supported-file")]),
        headers: new Headers({
          "x-chunk-index": "0",
          "x-upload-id": "upload-1",
        }),
        user,
      }),
    ).rejects.toMatchObject({
      message: "Unsupported or unrecognized file type",
      status: 415,
    });

    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
    expect(mocks.putObjectStream).not.toHaveBeenCalled();
  });

  it("rejects disallowed MIME types on the first chunk", async () => {
    const user = createUser();
    const harness = createDbHarness({
      session: [
        {
          encryptedFek: encryptFEK(Buffer.alloc(32, 2), user.uek),
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);
    mocks.fileTypeFromBuffer.mockResolvedValueOnce({
      ext: "txt",
      mime: "text/plain",
    });

    await expect(
      uploadChunk({
        body: createStream([Buffer.from("plain-text")]),
        headers: new Headers({
          "x-chunk-index": "0",
          "x-upload-id": "upload-1",
        }),
        user,
      }),
    ).rejects.toMatchObject({
      message: "File type text/plain is not allowed",
      status: 415,
    });

    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
    expect(mocks.putObjectStream).not.toHaveBeenCalled();
  });

  it("returns a conflict without deleting R2 data when the unique chunk constraint is hit", async () => {
    const user = createUser();
    const duplicateEntryError = Object.assign(new Error("duplicate chunk"), {
      code: "ER_DUP_ENTRY",
    });
    const harness = createDbHarness({
      persistError: duplicateEntryError,
      session: [
        {
          encryptedFek: encryptFEK(Buffer.alloc(32, 2), user.uek),
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      uploadChunk({
        body: createStream([Buffer.from("%PDF-upload")]),
        headers: new Headers({
          "x-chunk-index": "0",
          "x-upload-id": "upload-1",
        }),
        user,
      }),
    ).rejects.toMatchObject({
      message: "Chunk already uploaded",
      status: 409,
    });

    expect(mocks.putObjectStream).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
  });

  it("deletes the uploaded chunk when persistence fails after the R2 upload", async () => {
    const user = createUser();
    const harness = createDbHarness({
      persistError: new Error("db write failed"),
      session: [
        {
          encryptedFek: encryptFEK(Buffer.alloc(32, 2), user.uek),
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        },
      ],
    });
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      uploadChunk({
        body: createStream([Buffer.from("%PDF-upload")]),
        headers: new Headers({
          "x-chunk-index": "0",
          "x-upload-id": "upload-1",
        }),
        user,
      }),
    ).rejects.toThrow("db write failed");

    expect(mocks.putObjectStream).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith("user-1/files/file-1/chunk_0");
    expect(harness.spies.execute).toHaveBeenCalledTimes(2);
  });
});
