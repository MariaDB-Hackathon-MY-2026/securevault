import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sliceFilesWithMetaData: vi.fn(),
}));

vi.mock("@/lib/storage/chunker", () => ({
  sliceFilesWithMetaData: mocks.sliceFilesWithMetaData,
}));

import { UploadJob, type UploadJobSnapshot } from "@/lib/upload/upload-job";


type MockedChunk = {
  blob: Blob;
  end: number;
  index: number;
  size: number;
  start: number;
};

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function createFile(name = "report.pdf", contents = "hello world", type = "") {
  return new File([contents], name, { type });
}

function createChunk(index: number, text: string): MockedChunk {
  const blob = new Blob([text], { type: "application/octet-stream" });

  return {
    blob,
    end: text.length,
    index,
    size: blob.size,
    start: 0,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    status,
  });
}

function collectSnapshots(job: UploadJob) {
  const snapshots: UploadJobSnapshot[] = [];
  const unsubscribe = job.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  return { snapshots, unsubscribe };
}

function getFetchMock() {
  return global.fetch as unknown as ReturnType<typeof vi.fn>;
}

function mockFetchSequence(
  responses: Array<Response | Promise<Response>>,
) {
  const fetchMock = getFetchMock();
  let callIndex = 0;

  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/upload/start") {
      return Promise.resolve(jsonResponse(200, {
        activeCount: 1,
        maxActiveUploads: 3,
        uploadId: "upload-1",
      }));
    }

    if (url === "/api/upload/release") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }

    const nextResponse = responses[callIndex];
    callIndex += 1;

    if (!nextResponse) {
      throw new Error(`Unexpected fetch call at index ${callIndex}`);
    }

    return nextResponse instanceof Promise ? nextResponse : Promise.resolve(nextResponse);
  });
}

function getUploadedChunkIndexes() {
  const fetchMock = getFetchMock();

  return fetchMock.mock.calls
    .filter(([url]) => url === "/api/upload/chunk")
    .map(([, init]) => {
      const headers = init?.headers as HeadersInit | undefined;

      if (!headers || Array.isArray(headers) || headers instanceof Headers) {
        throw new Error("Expected chunk uploads to use a plain object for headers");
      }

      return Number(headers["x-chunk-index"]);
    });
}

describe("UploadJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("job-1");
    mocks.sliceFilesWithMetaData.mockReturnValue([]);
  });

  it("returns the constructor defaults in the initial snapshot", () => {
    const file = createFile();
    const job = new UploadJob(file);

    expect(job.getSnapshot()).toEqual({
      completedChunkIndexes: [],
      error: null,
      file,
      fileId: null,
      id: "job-1",
      indexingError: null,
      indexingStatus: "idle",
      progress: 0,
      status: "queued",
      uploadId: null,
    });
  });

  it("subscribes to notifications and the returned unsubscribe stops later updates", async () => {
    const file = createFile();
    const job = new UploadJob(file);
    const { snapshots, unsubscribe } = collectSnapshots(job);
    const initDeferred = createDeferred<Response>();

    getFetchMock().mockImplementationOnce(() => initDeferred.promise);

    const startPromise = job.start();

    expect(snapshots.at(-1)?.status).toBe("uploading");

    unsubscribe();
    job.pause();

    expect(snapshots).toHaveLength(1);

    initDeferred.reject(new Error("network down"));

    await expect(startPromise).rejects.toThrow("network down");
    expect(snapshots).toHaveLength(1);
  });

  it("ignores pause before start but allows cancel to transition to cancelled", () => {
    const job = new UploadJob(createFile());
    const { snapshots } = collectSnapshots(job);

    job.pause();
    expect(job.getSnapshot().status).toBe("queued");
    expect(snapshots).toEqual([]);

    job.cancel();
    expect(job.getSnapshot().status).toBe("cancelled");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].status).toBe("cancelled");
  });

  it("transitions from uploading to pausing when pause is requested", async () => {
    const job = new UploadJob(createFile());
    const initDeferred = createDeferred<Response>();
    const { snapshots } = collectSnapshots(job);

    getFetchMock().mockImplementationOnce(() => initDeferred.promise);

    const startPromise = job.start();
    job.pause();

    expect(job.getSnapshot().status).toBe("pausing");
    expect(snapshots.at(-1)?.status).toBe("pausing");

    initDeferred.reject(new Error("network down"));
    await expect(startPromise).rejects.toThrow("network down");
  });

  it("transitions to cancelling from uploading and pausing", async () => {
    const job = new UploadJob(createFile());
    const initDeferred = createDeferred<Response>();

    getFetchMock().mockImplementationOnce(() => initDeferred.promise);

    const startPromise = job.start();
    job.pause();
    job.cancel();

    expect(job.getSnapshot().status).toBe("cancelling");

    initDeferred.reject(new Error("network down"));
    await expect(startPromise).rejects.toThrow("network down");
  });

  it("resumes from paused back to queued and clears the error", async () => {
    const job = new UploadJob(createFile());
    const { snapshots } = collectSnapshots(job);

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0"), createChunk(1, "chunk-1")]);
    getFetchMock().mockImplementation((url: string) => {
      if (url === "/api/upload/init") {
        return Promise.resolve(jsonResponse(200, {
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/status?uploadId=upload-1") {
        return Promise.resolve(jsonResponse(200, {
          completedChunkIndexes: [],
          fileId: "file-1",
          status: "uploading",
          totalChunks: 2,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/chunk") {
        job.pause();

        return Promise.resolve(jsonResponse(200, {
          chunkIndex: 0,
          status: "uploaded",
        }));
      }

      if (url === "/api/upload/start") {
        return Promise.resolve(jsonResponse(200, {
          activeCount: 1,
          maxActiveUploads: 3,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/release") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch url ${url}`);
    });

    await job.start();

    expect(job.getSnapshot().status).toBe("paused");

    job.resume();

    expect(job.getSnapshot().status).toBe("queued");
    expect(job.getSnapshot().error).toBeNull();
    expect(snapshots.at(-1)?.status).toBe("queued");
  });

  it("resumes from failed back to queued and clears the error", async () => {
    const job = new UploadJob(createFile());

    getFetchMock().mockResolvedValueOnce(jsonResponse(400, { message: "bad init" }));

    await expect(job.start()).rejects.toMatchObject({
      code: "INIT_FAILED",
      stage: "init",
    });

    expect(job.getSnapshot().status).toBe("failed");
    expect(job.getSnapshot().error).toBe("bad init");

    job.resume();

    expect(job.getSnapshot().status).toBe("queued");
    expect(job.getSnapshot().error).toBeNull();
  });

  it("does not start again when the job is no longer queued", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 0,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 0,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();

    expect(job.getSnapshot().status).toBe("success");

    getFetchMock().mockClear();
    await job.start();

    expect(getFetchMock()).not.toHaveBeenCalled();
  });

  it("runs the happy-path upload flow and emits milestone snapshots", async () => {
    const job = new UploadJob(createFile());
    const { snapshots } = collectSnapshots(job);

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0"), createChunk(1, "chunk-1")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        chunkIndex: 0,
        status: "uploaded",
      }),
      jsonResponse(200, {
        chunkIndex: 1,
        status: "uploaded",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();

    expect(getFetchMock().mock.calls.map(([url]) => url)).toEqual([
      "/api/upload/init",
      "/api/upload/status?uploadId=upload-1",
      "/api/upload/start",
      "/api/upload/chunk",
      "/api/upload/chunk",
      "/api/upload/complete",
      "/api/upload/release",
    ]);
    expect(getUploadedChunkIndexes()).toEqual([0, 1]);
    expect(job.getSnapshot()).toMatchObject({
      completedChunkIndexes: [0, 1],
      fileId: "file-1",
      indexingStatus: "skipped",
      progress: 100,
      status: "success",
      uploadId: "upload-1",
    });
    expect(snapshots.some((snapshot) => snapshot.status === "uploading")).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.uploadId === "upload-1")).toBe(true);
    expect(snapshots.some((snapshot) => snapshot.progress === 50)).toBe(true);
    expect(snapshots.at(-1)?.status).toBe("success");
  });

  it("skips chunk uploads that the status endpoint says are already completed", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([
      createChunk(0, "chunk-0"),
      createChunk(1, "chunk-1"),
      createChunk(2, "chunk-2"),
    ]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 3,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [0],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 3,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        chunkIndex: 1,
        status: "uploaded",
      }),
      jsonResponse(200, {
        chunkIndex: 2,
        status: "uploaded",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();

    expect(getUploadedChunkIndexes()).toEqual([1, 2]);
    expect(job.getSnapshot().completedChunkIndexes).toEqual([0, 1, 2]);
    expect(job.getSnapshot().status).toBe("success");
  });

  it("exits early when the server already reports the upload as completed", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0"), createChunk(1, "chunk-1")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [0, 1],
        fileId: "file-1",
        status: "completed",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
    ]);

    await job.start();

    expect(getUploadedChunkIndexes()).toEqual([]);
    expect(getFetchMock()).toHaveBeenCalledTimes(2);
    expect(job.getSnapshot()).toMatchObject({
      completedChunkIndexes: [0, 1],
      indexingStatus: "idle",
      progress: 100,
      status: "success",
    });
  });

  it("fails fast for a forbidden client-side file type before calling upload init", async () => {
    const job = new UploadJob(createFile("malware.exe", "binary", "application/x-msdownload"));

    await expect(job.start()).rejects.toMatchObject({
      code: "UNSUPPORTED_TYPE",
      message: "File type application/x-msdownload is not allowed",
      stage: "unknown",
    });
    expect(job.getSnapshot()).toMatchObject({
      error: "File type application/x-msdownload is not allowed",
      status: "failed",
    });
    expect(getFetchMock()).not.toHaveBeenCalled();
  });
  it("allows an empty client MIME type and relies on the server-side sniffing path", async () => {
    const job = new UploadJob(createFile("mystery.bin", "hello", ""));

    mocks.sliceFilesWithMetaData.mockReturnValue([]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 0,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 0,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();

    expect(getFetchMock().mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        fileName: "mystery.bin",
        fileSize: 5,
        fileType: "",
      }),
    });
    expect(job.getSnapshot().status).toBe("success");
  });
  it("fails with an init-stage UploadJobError when init returns a bad response", async () => {
    const job = new UploadJob(createFile());

    getFetchMock().mockResolvedValueOnce(jsonResponse(400, { message: "bad init" }));

    await expect(job.start()).rejects.toMatchObject({
      code: "INIT_FAILED",
      message: "bad init",
      stage: "init",
    });
    expect(job.getSnapshot().status).toBe("failed");
    expect(job.getSnapshot().error).toBe("bad init");
    expect(getFetchMock()).toHaveBeenCalledTimes(1);
  });

  it("fails with a status-stage UploadJobError when status returns a bad response", async () => {
    const job = new UploadJob(createFile());

    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
      jsonResponse(400, { message: "bad status" }),
    ]);

    await expect(job.start()).rejects.toMatchObject({
      code: "STATUS_FAILED",
      message: "bad status",
      stage: "status",
    });
    expect(job.getSnapshot().status).toBe("failed");
    expect(getFetchMock()).toHaveBeenCalledTimes(2);
  });

  it("fails with a chunk-stage UploadJobError when a chunk upload returns a bad response", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(400, { message: "bad chunk" }),
    ]);

    await expect(job.start()).rejects.toMatchObject({
      code: "CHUNK_FAILED",
      message: "bad chunk",
      stage: "chunk",
    });
    expect(job.getSnapshot().status).toBe("failed");
    expect(getFetchMock()).toHaveBeenCalledTimes(5);
  });

  it("surfaces the server file-type validation message on the upload snapshot", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(415, { message: "File type application/x-msdownload is not allowed" }),
    ]);

    await expect(job.start()).rejects.toMatchObject({
      code: "UNSUPPORTED_TYPE",
      message: "File type application/x-msdownload is not allowed",
      stage: "chunk",
    });
    expect(job.getSnapshot()).toMatchObject({
      error: "File type application/x-msdownload is not allowed",
      status: "failed",
    });
  });
  it("treats a 409 chunk response as resumable success and continues the upload", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(409, { message: "Chunk already uploaded" }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();

    expect(getUploadedChunkIndexes()).toEqual([0]);
    expect(job.getSnapshot()).toMatchObject({
      completedChunkIndexes: [0],
      progress: 100,
      status: "success",
    });
  });

  it("retries a rate-limited chunk upload with backoff and eventually succeeds", async () => {
    vi.useFakeTimers();
    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(429, { message: "Too many requests" }),
      jsonResponse(429, { message: "Too many requests" }),
      jsonResponse(200, {
        chunkIndex: 0,
        status: "uploaded",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    const startPromise = job.start();

    await vi.runAllTimersAsync();
    await startPromise;

    expect(getUploadedChunkIndexes()).toEqual([0, 0, 0]);
    expect(job.getSnapshot().status).toBe("success");
    expect(job.getSnapshot().progress).toBe(100);

    mathRandomSpy.mockRestore();
    vi.useRealTimers();
  });

  it("retries a retryable chunk failure up to the max and then fails", async () => {
    vi.useFakeTimers();
    const mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(500, { message: "server exploded" }),
      jsonResponse(500, { message: "server exploded" }),
      jsonResponse(500, { message: "server exploded" }),
      jsonResponse(500, { message: "server exploded" }),
    ]);

    const startPromise = job.start();
    const startAssertion = expect(startPromise).rejects.toMatchObject({
      code: "SERVER_ERROR",
      message: "server exploded",
      stage: "chunk",
    });

    await vi.runAllTimersAsync();
    await startAssertion;
    expect(getUploadedChunkIndexes()).toEqual([0, 0, 0, 0]);
    expect(job.getSnapshot().status).toBe("failed");

    mathRandomSpy.mockRestore();
    vi.useRealTimers();
  });

  it("does not retry non-retryable chunk failures", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(400, { message: "bad request" }),
    ]);

    await expect(job.start()).rejects.toMatchObject({
      code: "CHUNK_FAILED",
      message: "bad request",
      stage: "chunk",
    });
    expect(getUploadedChunkIndexes()).toEqual([0]);
    expect(job.getSnapshot().status).toBe("failed");
  });

  it("fails with a complete-stage UploadJobError when complete returns a bad response", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        chunkIndex: 0,
        status: "uploaded",
      }),
      jsonResponse(400, { message: "bad complete" }),
    ]);

    await expect(job.start()).rejects.toMatchObject({
      code: "COMPLETE_FAILED",
      message: "bad complete",
      stage: "complete",
    });
    expect(job.getSnapshot().status).toBe("failed");
    expect(getFetchMock()).toHaveBeenCalledTimes(6);
  });

  it("pauses after the current chunk completes", async () => {
    const job = new UploadJob(createFile());
    const { snapshots } = collectSnapshots(job);

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0"), createChunk(1, "chunk-1")]);
    getFetchMock().mockImplementation((url: string) => {
      if (url === "/api/upload/init") {
        return Promise.resolve(jsonResponse(200, {
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/status?uploadId=upload-1") {
        return Promise.resolve(jsonResponse(200, {
          completedChunkIndexes: [],
          fileId: "file-1",
          status: "uploading",
          totalChunks: 2,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/chunk") {
        job.pause();

        return Promise.resolve(jsonResponse(200, {
          chunkIndex: 0,
          status: "uploaded",
        }));
      }

      if (url === "/api/upload/start") {
        return Promise.resolve(jsonResponse(200, {
          activeCount: 1,
          maxActiveUploads: 3,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/release") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch url ${url}`);
    });

    await job.start();

    expect(getUploadedChunkIndexes()).toEqual([0]);
    expect(getFetchMock().mock.calls.map(([url]) => url)).not.toContain("/api/upload/complete");
    expect(job.getSnapshot()).toMatchObject({
      completedChunkIndexes: [0],
      indexingStatus: "idle",
      progress: 50,
      status: "paused",
    });
    expect(snapshots.some((snapshot) => snapshot.status === "pausing")).toBe(true);
    expect(snapshots.at(-1)?.status).toBe("paused");
  });

  it("cancels after the current chunk completes", async () => {
    const job = new UploadJob(createFile());
    const { snapshots } = collectSnapshots(job);

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0"), createChunk(1, "chunk-1")]);
    getFetchMock().mockImplementation((url: string) => {
      if (url === "/api/upload/init") {
        return Promise.resolve(jsonResponse(200, {
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/status?uploadId=upload-1") {
        return Promise.resolve(jsonResponse(200, {
          completedChunkIndexes: [],
          fileId: "file-1",
          status: "uploading",
          totalChunks: 2,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/chunk") {
        job.cancel();

        return Promise.resolve(jsonResponse(200, {
          chunkIndex: 0,
          status: "uploaded",
        }));
      }

      if (url === "/api/upload/start") {
        return Promise.resolve(jsonResponse(200, {
          activeCount: 1,
          maxActiveUploads: 3,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/release") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch url ${url}`);
    });

    await job.start();

    expect(getUploadedChunkIndexes()).toEqual([0]);
    expect(getFetchMock().mock.calls.map(([url]) => url)).not.toContain("/api/upload/complete");
    expect(job.getSnapshot()).toMatchObject({
      completedChunkIndexes: [0],
      indexingStatus: "idle",
      progress: 50,
      status: "cancelled",
    });
    expect(snapshots.some((snapshot) => snapshot.status === "cancelling")).toBe(true);
    expect(snapshots.at(-1)?.status).toBe("cancelled");
  });

  it("maps server failed status to client failed and exits early", async () => {
    const job = new UploadJob(createFile());

    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [0],
        fileId: "file-1",
        status: "failed",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
    ]);

    await job.start();

    expect(job.getSnapshot().status).toBe("failed");
    expect(getUploadedChunkIndexes()).toEqual([]);
    expect(getFetchMock()).toHaveBeenCalledTimes(2);
  });

  it("maps server expired status to client failed and exits early", async () => {
    const job = new UploadJob(createFile());

    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "expired",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
    ]);

    await job.start();

    expect(job.getSnapshot().status).toBe("failed");
    expect(getUploadedChunkIndexes()).toEqual([]);
    expect(getFetchMock()).toHaveBeenCalledTimes(2);
  });

  it("sorts out-of-order completed chunk indexes from the status response", async () => {
    const job = new UploadJob(createFile());
    const { snapshots } = collectSnapshots(job);

    mocks.sliceFilesWithMetaData.mockReturnValue([
      createChunk(0, "chunk-0"),
      createChunk(1, "chunk-1"),
      createChunk(2, "chunk-2"),
    ]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 3,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [2, 0],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 3,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        chunkIndex: 1,
        status: "uploaded",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();

    const statusSnapshot = snapshots.find((snapshot) => snapshot.progress > 0 && snapshot.progress < 100);

    expect(statusSnapshot?.completedChunkIndexes).toEqual([0, 2]);
    expect(job.getSnapshot().completedChunkIndexes).toEqual([0, 1, 2]);
  });

  it("deduplicates repeated completed chunk indexes and does not overcount progress", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0"), createChunk(1, "chunk-1")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [0, 0, 1],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 2,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();

    expect(job.getSnapshot()).toMatchObject({
      completedChunkIndexes: [0, 1],
      indexingStatus: "skipped",
      progress: 100,
      status: "success",
    });
    expect(getUploadedChunkIndexes()).toEqual([]);
  });

  it("ignores resume after the job has been cancelled", async () => {
    const job = new UploadJob(createFile());
    const { snapshots } = collectSnapshots(job);

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0"), createChunk(1, "chunk-1")]);
    getFetchMock().mockImplementation((url: string) => {
      if (url === "/api/upload/init") {
        return Promise.resolve(jsonResponse(200, {
          fileId: "file-1",
          totalChunks: 2,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/status?uploadId=upload-1") {
        return Promise.resolve(jsonResponse(200, {
          completedChunkIndexes: [],
          fileId: "file-1",
          status: "uploading",
          totalChunks: 2,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/chunk") {
        job.cancel();

        return Promise.resolve(jsonResponse(200, {
          chunkIndex: 0,
          status: "uploaded",
        }));
      }

      if (url === "/api/upload/start") {
        return Promise.resolve(jsonResponse(200, {
          activeCount: 1,
          maxActiveUploads: 3,
          uploadId: "upload-1",
        }));
      }

      if (url === "/api/upload/release") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch url ${url}`);
    });

    await job.start();
    const snapshotCountBeforeResume = snapshots.length;

    job.resume();

    expect(job.getSnapshot().status).toBe("cancelled");
    expect(snapshots).toHaveLength(snapshotCountBeforeResume);
  });

  it("handles raw fetch rejections by marking the job as failed and storing the message", async () => {
    const job = new UploadJob(createFile());
    const { snapshots } = collectSnapshots(job);

    getFetchMock().mockRejectedValueOnce(new Error("network down"));

    await expect(job.start()).rejects.toThrow("network down");

    expect(job.getSnapshot()).toMatchObject({
      error: "network down",
      indexingStatus: "idle",
      status: "failed",
    });
    expect(snapshots.at(-1)?.status).toBe("failed");
  });

  it("supports zero-chunk uploads by calling init, status, and complete only", async () => {
    const job = new UploadJob(createFile());

    mocks.sliceFilesWithMetaData.mockReturnValue([]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 0,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 0,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();

    expect(getFetchMock().mock.calls.map(([url]) => url)).toEqual([
      "/api/upload/init",
      "/api/upload/status?uploadId=upload-1",
      "/api/upload/start",
      "/api/upload/complete",
      "/api/upload/release",
    ]);
    expect(job.getSnapshot()).toMatchObject({
      completedChunkIndexes: [],
      indexingStatus: "skipped",
      progress: 100,
      status: "success",
    });
  });


  it("triggers semantic indexing for eligible pdf uploads without blocking upload success", async () => {
    const job = new UploadJob(createFile("report.pdf", "pdf-body", "application/pdf"));

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        chunkIndex: 0,
        status: "uploaded",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
      new Response(null, { status: 204 }),
    ]);

    await job.start();
    await Promise.resolve();

    expect(getFetchMock().mock.calls.map(([url]) => url)).toEqual([
      "/api/upload/init",
      "/api/upload/status?uploadId=upload-1",
      "/api/upload/start",
      "/api/upload/chunk",
      "/api/upload/complete",
      "/api/embeddings",
      "/api/upload/release",
    ]);
    expect(getFetchMock().mock.calls[5]?.[1]).toMatchObject({
      body: JSON.stringify({
        fileId: "file-1",
        modality: "pdf",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(job.getSnapshot()).toMatchObject({
      indexingError: null,
      indexingStatus: "queued",
      status: "success",
    });
  });

  it("triggers semantic indexing for eligible image uploads", async () => {
    const job = new UploadJob(createFile("photo.png", "image-body", "image/png"));

    mocks.sliceFilesWithMetaData.mockReturnValue([createChunk(0, "chunk-0")]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 1,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        chunkIndex: 0,
        status: "uploaded",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
      new Response(null, { status: 204 }),
    ]);

    await job.start();
    await Promise.resolve();

    expect(getFetchMock().mock.calls[5]?.[0]).toBe("/api/embeddings");
    expect(getFetchMock().mock.calls[5]?.[1]).toMatchObject({
      body: JSON.stringify({
        fileId: "file-1",
        modality: "image",
      }),
    });
    expect(job.getSnapshot().indexingStatus).toBe("queued");
  });

  it("skips semantic indexing for ineligible files and oversized pdfs", async () => {
    const oversizedPdf = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf",
    });
    const job = new UploadJob(oversizedPdf);

    mocks.sliceFilesWithMetaData.mockReturnValue([]);
    mockFetchSequence([
      jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 0,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 0,
        uploadId: "upload-1",
      }),
      jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }),
    ]);

    await job.start();
    await Promise.resolve();

    expect(getFetchMock().mock.calls.map(([url]) => url)).toEqual([
      "/api/upload/init",
      "/api/upload/status?uploadId=upload-1",
      "/api/upload/start",
      "/api/upload/complete",
      "/api/upload/release",
    ]);
    expect(job.getSnapshot()).toMatchObject({
      indexingStatus: "skipped",
      status: "success",
    });
  });

  it("captures semantic indexing trigger failures without rolling back the ready upload", async () => {
    const job = new UploadJob(createFile("report.pdf", "pdf-body", "application/pdf"));

    mocks.sliceFilesWithMetaData.mockReturnValue([]);
    getFetchMock()
      .mockResolvedValueOnce(jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 0,
        uploadId: "upload-1",
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 0,
        uploadId: "upload-1",
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        activeCount: 1,
        maxActiveUploads: 3,
        uploadId: "upload-1",
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }))
      .mockRejectedValueOnce(new Error("indexing service unavailable"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await job.start();
    await Promise.resolve();

    expect(job.getSnapshot()).toMatchObject({
      indexingError: "indexing service unavailable",
      indexingStatus: "failed",
      progress: 100,
      status: "success",
    });
  });

  it("does not mark indexing as failed just because client polling timed out", async () => {
    vi.useFakeTimers();
    const job = new UploadJob(createFile("report.pdf", "pdf-body", "application/pdf"));

    mocks.sliceFilesWithMetaData.mockReturnValue([]);
    getFetchMock()
      .mockResolvedValueOnce(jsonResponse(200, {
        fileId: "file-1",
        totalChunks: 0,
        uploadId: "upload-1",
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        completedChunkIndexes: [],
        fileId: "file-1",
        status: "uploading",
        totalChunks: 0,
        uploadId: "upload-1",
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        activeCount: 1,
        maxActiveUploads: 3,
        uploadId: "upload-1",
      }))
      .mockResolvedValueOnce(jsonResponse(200, {
        fileId: "file-1",
        status: "ready",
      }))
      .mockResolvedValueOnce(jsonResponse(202, {
        accepted: true,
        attemptCount: 0,
        errorCode: null,
        fileId: "file-1",
        jobId: "job-1",
        modality: "pdf",
        retryable: false,
        status: "processing",
        updatedAt: "2026-04-15T00:00:00.000Z",
      }))
      .mockImplementation((url: string) => {
        if (url === "/api/upload/release") {
          return Promise.resolve(new Response(null, { status: 204 }));
        }

        if (url === "/api/embeddings/file-1") {
          return Promise.resolve(jsonResponse(200, {
            jobs: [
              {
                errorCode: null,
                errorMessage: null,
                modality: "pdf",
                status: "processing",
              },
            ],
          }));
        }

        throw new Error(`Unexpected fetch url ${url}`);
      });

    await job.start();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(job.getSnapshot()).toMatchObject({
      indexingError: null,
      indexingStatus: "processing",
      status: "success",
    });

    vi.useRealTimers();
  });

  it("propagates listener errors during notify and does not continue the upload", async () => {
    const job = new UploadJob(createFile());
    const secondListener = vi.fn();

    job.subscribe(() => {
      throw new Error("listener blew up");
    });
    job.subscribe(secondListener);

    await expect(job.start()).rejects.toThrow("listener blew up");

    expect(getFetchMock()).not.toHaveBeenCalled();
    expect(secondListener).not.toHaveBeenCalled();
  });
});















