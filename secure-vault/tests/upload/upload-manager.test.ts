import { beforeEach, describe, expect, it, vi } from "vitest";

const jobState = vi.hoisted(() => {
  type Status =
    | "queued"
    | "uploading"
    | "pausing"
    | "paused"
    | "cancelling"
    | "cancelled"
    | "success"
    | "failed";

  type Snapshot = {
    completedChunkIndexes: number[];
    error: string | null;
    file: File;
    fileId: string | null;
    id: string;
    progress: number;
    status: Status;
    uploadId: string | null;
  };

  type Listener = (snapshot: Snapshot) => void;

  const instances: MockUploadJob[] = [];
  let nextId = 1;
  let defaultStartImplementation: ((job: MockUploadJob) => Promise<void>) | null = null;

  class MockUploadJob {
    private listeners = new Set<Listener>();
    private snapshot: Snapshot;
    private startImplementation: (() => Promise<void>) | null;

    constructor(file: File) {
      this.snapshot = {
        completedChunkIndexes: [],
        error: null,
        file,
        fileId: null,
        id: `job-${nextId++}`,
        progress: 0,
        status: "queued",
        uploadId: null,
      };
      this.startImplementation = defaultStartImplementation
        ? () => defaultStartImplementation!(this)
        : null;

      instances.push(this);
    }

    static reset() {
      instances.length = 0;
      nextId = 1;
      defaultStartImplementation = null;
    }

    static getInstances() {
      return instances;
    }

    static setDefaultStartImplementation(
      implementation: ((job: MockUploadJob) => Promise<void>) | null,
    ) {
      defaultStartImplementation = implementation;
    }

    getSnapshot() {
      return this.snapshot;
    }

    subscribe(listener: Listener) {
      this.listeners.add(listener);

      return () => {
        this.listeners.delete(listener);
      };
    }

    start = vi.fn(async () => {
      if (this.startImplementation) {
        return this.startImplementation();
      }

      this.snapshot = { ...this.snapshot, status: "uploading" };
      this.emit();
    });

    pause = vi.fn(() => {
      this.snapshot = { ...this.snapshot, status: "pausing" };
      this.emit();
    });

    resume = vi.fn(() => {
      this.snapshot = { ...this.snapshot, status: "queued" };
      this.emit();
    });

    cancel = vi.fn(() => {
      this.snapshot = { ...this.snapshot, status: "cancelling" };
      this.emit();
    });

    setStatus(status: Status) {
      this.snapshot = { ...this.snapshot, status };
      this.emit();
    }

    setStartImplementation(implementation: (() => Promise<void>) | null) {
      this.startImplementation = implementation;
    }

    listenerCount() {
      return this.listeners.size;
    }

    private emit() {
      for (const listener of this.listeners) {
        listener(this.snapshot);
      }
    }
  }

  return { MockUploadJob };
});

vi.mock("@/lib/upload/upload-job", () => ({
  UploadJob: jobState.MockUploadJob,
}));

import { UploadManager } from "@/lib/upload/upload-manager";

function createFile(name: string) {
  return new File(["hello"], name, { type: "application/pdf" });
}

describe("UploadManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jobState.MockUploadJob.reset();
    Reflect.set(UploadManager, "instance", null);
  });

  it("adds files, exposes snapshots, and starts at most three jobs", () => {
    const manager = UploadManager.getInstance();
    const unsubscribe = manager.subscribe(() => undefined);
    const files = [
      createFile("one.pdf"),
      createFile("two.pdf"),
      createFile("three.pdf"),
      createFile("four.pdf"),
    ];

    manager.addFiles(files);

    const jobs = jobState.MockUploadJob.getInstances();

    expect(manager.getSnapshot().uploads).toHaveLength(4);
    expect(jobs[0]?.start).toHaveBeenCalledTimes(1);
    expect(jobs[1]?.start).toHaveBeenCalledTimes(1);
    expect(jobs[2]?.start).toHaveBeenCalledTimes(1);
    expect(jobs[3]?.start).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("starts the next queued job when an active job leaves the active pool", () => {
    const manager = UploadManager.getInstance();
    const files = [
      createFile("one.pdf"),
      createFile("two.pdf"),
      createFile("three.pdf"),
      createFile("four.pdf"),
    ];

    manager.addFiles(files);

    const jobs = jobState.MockUploadJob.getInstances();
    jobs[0]?.setStatus("success");

    expect(jobs[3]?.start).toHaveBeenCalledTimes(1);
  });

  it("delegates pause, resume, and cancel to the matching job", () => {
    const manager = UploadManager.getInstance();
    manager.addFiles([createFile("one.pdf")]);

    const [job] = jobState.MockUploadJob.getInstances();
    const jobId = job?.getSnapshot().id ?? "";

    manager.pauseUpload(jobId);
    expect(job?.pause).toHaveBeenCalledTimes(1);

    job?.setStatus("paused");
    manager.resumeUpload(jobId);
    expect(job?.resume).toHaveBeenCalledTimes(1);

    job?.setStatus("uploading");
    manager.cancelUpload(jobId);
    expect(job?.cancel).toHaveBeenCalledTimes(1);
  });

  it("removes only terminal jobs and cleans up the job subscription", () => {
    const manager = UploadManager.getInstance();
    manager.addFiles([createFile("one.pdf"), createFile("two.pdf")]);

    const [firstJob, secondJob] = jobState.MockUploadJob.getInstances();
    const firstJobId = firstJob?.getSnapshot().id ?? "";
    const secondJobId = secondJob?.getSnapshot().id ?? "";

    firstJob?.setStatus("uploading");
    manager.removeUpload(firstJobId);

    expect(manager.getSnapshot().uploads).toHaveLength(2);
    expect(firstJob?.listenerCount()).toBe(1);

    secondJob?.setStatus("success");
    manager.removeUpload(secondJobId);

    expect(manager.getSnapshot().uploads).toHaveLength(1);
    expect(secondJob?.listenerCount()).toBe(0);
  });

  it("manager subscribe returns an unsubscribe cleanup", () => {
    const manager = UploadManager.getInstance();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    manager.addFiles([createFile("one.pdf")]);
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    unsubscribe();

    jobState.MockUploadJob.getInstances()[0]?.setStatus("success");

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not remove unknown or non-terminal jobs", () => {
    const manager = UploadManager.getInstance();

    manager.addFiles([createFile("one.pdf")]);

    const [job] = jobState.MockUploadJob.getInstances();
    const jobId = job?.getSnapshot().id ?? "";

    manager.removeUpload("missing-job");
    expect(manager.getSnapshot().uploads).toHaveLength(1);

    manager.removeUpload(jobId);
    expect(manager.getSnapshot().uploads).toHaveLength(1);
    expect(job?.listenerCount()).toBe(1);
  });

  it("does not start a resumed job until a concurrency slot is free", () => {
    const manager = UploadManager.getInstance();
    const files = [
      createFile("one.pdf"),
      createFile("two.pdf"),
      createFile("three.pdf"),
      createFile("four.pdf"),
    ];

    manager.addFiles(files);

    const jobs = jobState.MockUploadJob.getInstances();
    jobs[2]?.setStatus("paused");

    expect(jobs[3]?.start).toHaveBeenCalledTimes(1);

    manager.resumeUpload(jobs[2]?.getSnapshot().id ?? "");

    expect(jobs[2]?.resume).toHaveBeenCalledTimes(1);
    expect(jobs[2]?.start).toHaveBeenCalledTimes(1);

    jobs[0]?.setStatus("success");

    expect(jobs[2]?.start).toHaveBeenCalledTimes(2);
  });

  it("continues scheduling after a job start rejects and frees its slot", async () => {
    const manager = UploadManager.getInstance();
    const startError = new Error("start failed");

    jobState.MockUploadJob.setDefaultStartImplementation(async (job) => {
      const snapshot = job.getSnapshot();

      if (snapshot.file.name === "one.pdf") {
        job.setStatus("uploading");
        job.setStatus("failed");
        throw startError;
      }

      job.setStatus("uploading");
    });

    manager.addFiles([
      createFile("one.pdf"),
      createFile("two.pdf"),
      createFile("three.pdf"),
      createFile("four.pdf"),
    ]);

    await Promise.resolve();
    await Promise.resolve();

    const jobs = jobState.MockUploadJob.getInstances();

    expect(jobs[0]?.start).toHaveBeenCalledTimes(1);
    expect(jobs[1]?.start).toHaveBeenCalledTimes(1);
    expect(jobs[2]?.start).toHaveBeenCalledTimes(1);
    expect(jobs[3]?.start).toHaveBeenCalledTimes(1);
    expect(jobs[0]?.getSnapshot().status).toBe("failed");
    expect(jobs[3]?.getSnapshot().status).toBe("uploading");
  });

  it("preserves insertion order in snapshots across queue activity and removals", () => {
    const manager = UploadManager.getInstance();

    manager.addFiles([
      createFile("one.pdf"),
      createFile("two.pdf"),
      createFile("three.pdf"),
    ]);

    let uploads = manager.getSnapshot().uploads;

    expect(uploads.map((upload) => upload.file.name)).toEqual([
      "one.pdf",
      "two.pdf",
      "three.pdf",
    ]);

    const [, secondJob] = jobState.MockUploadJob.getInstances();
    secondJob?.setStatus("success");
    manager.removeUpload(secondJob?.getSnapshot().id ?? "");

    uploads = manager.getSnapshot().uploads;

    expect(uploads.map((upload) => upload.file.name)).toEqual([
      "one.pdf",
      "three.pdf",
    ]);
  });

  it("returns the same singleton instance on repeated calls", () => {
    const firstInstance = UploadManager.getInstance();
    const secondInstance = UploadManager.getInstance();

    expect(firstInstance).toBe(secondInstance);
  });
});



