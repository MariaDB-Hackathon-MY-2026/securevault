import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import { fileChunks, uploadSessions } from "@/lib/db/schema";
import {
  getUploadStatus,
  UploadStatusServiceError,
  validateUploadStatusSearchParams,
} from "@/app/api/upload/status/service";

function createDbHarness(options?: {
  chunkRows?: Array<{ chunkIndex: number }>;
  sessionRows?: Array<{
    expiresAt: Date;
    fileId: string;
    status: "uploading" | "completed" | "failed";
    totalChunks: number;
    uploadId: string;
  }>;
}) {
  const sessionLimit = vi.fn().mockResolvedValue(options?.sessionRows ?? []);
  const sessionWhere = vi.fn(() => ({ limit: sessionLimit }));

  const chunkOrderBy = vi.fn().mockResolvedValue(options?.chunkRows ?? []);
  const chunkWhere = vi.fn(() => ({ orderBy: chunkOrderBy }));

  const selectFrom = vi.fn((table: unknown) => {
    if (table === uploadSessions) {
      return { where: sessionWhere };
    }

    if (table === fileChunks) {
      return { where: chunkWhere };
    }

    throw new Error("Unexpected table in select.from");
  });

  const select = vi.fn(() => ({ from: selectFrom }));

  return {
    db: { select },
    spies: {
      chunkOrderBy,
      chunkWhere,
      select,
      selectFrom,
      sessionLimit,
      sessionWhere,
    },
  };
}

describe("upload status service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.spyOn(MariadbConnection, "getConnection").mockImplementation(() => {
      throw new Error("getConnection mock not configured");
    });
  });

  it("validates the upload id from query params", () => {
    const result = validateUploadStatusSearchParams(
      new URLSearchParams({
        uploadId: "a".repeat(21),
      }),
    );

    expect(result).toEqual({
      uploadId: "a".repeat(21),
    });
  });

  it("rejects missing upload ids", () => {
    expect(() => validateUploadStatusSearchParams(new URLSearchParams())).toThrowError(
      new UploadStatusServiceError("uploadId must be a valid upload session id", 400),
    );
  });

  it("returns sorted completed chunk indexes for active uploads", async () => {
    const harness = createDbHarness({
      chunkRows: [{ chunkIndex: 0 }, { chunkIndex: 2 }, { chunkIndex: 4 }],
      sessionRows: [
        {
          expiresAt: new Date("2026-03-24T00:00:00.000Z"),
          fileId: "file-1",
          status: "uploading",
          totalChunks: 5,
          uploadId: "a".repeat(21),
        },
      ],
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T00:00:00.000Z"));
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await getUploadStatus(
      { id: "user-1" },
      { uploadId: "a".repeat(21) },
    );

    expect(result).toEqual({
      completedChunkIndexes: [0, 2, 4],
      fileId: "file-1",
      status: "uploading",
      totalChunks: 5,
      uploadId: "a".repeat(21),
    });
    expect(harness.spies.chunkOrderBy).toHaveBeenCalledTimes(1);
  });

  it("returns expired status without querying chunk rows when the session is stale", async () => {
    const harness = createDbHarness({
      sessionRows: [
        {
          expiresAt: new Date("2026-03-22T00:00:00.000Z"),
          fileId: "file-1",
          status: "uploading",
          totalChunks: 3,
          uploadId: "a".repeat(21),
        },
      ],
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T00:00:00.000Z"));
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    const result = await getUploadStatus(
      { id: "user-1" },
      { uploadId: "a".repeat(21) },
    );

    expect(result).toEqual({
      completedChunkIndexes: [],
      fileId: "file-1",
      status: "expired",
      totalChunks: 3,
      uploadId: "a".repeat(21),
    });
    expect(harness.spies.chunkWhere).not.toHaveBeenCalled();
  });

  it("throws 404 when the upload session does not exist", async () => {
    const harness = createDbHarness();
    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue(harness.db as never);

    await expect(
      getUploadStatus({ id: "user-1" }, { uploadId: "a".repeat(21) }),
    ).rejects.toMatchObject({
      message: "Upload session not found",
      status: 404,
    });
  });
});
