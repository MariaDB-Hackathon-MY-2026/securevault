import { UploadJob, type UploadJobSnapshot } from "@/lib/upload/upload-job";
import {
  ACTIVE_UPLOAD_STATUSES,
  MAX_CONCURRENT_UPLOADS,
  REMOVABLE_UPLOAD_STATUSES,
} from "@/lib/upload/upload-manager.constants";

export type UploadManagerSnapshot = {
  uploads: UploadJobSnapshot[];
};

export type UploadManagerListener = (snapshot: UploadManagerSnapshot) => void;

export class UploadManager {
  private readonly jobs: Map<string, UploadJob>;
  private readonly jobUnsubscribes: Map<string, () => void>;
  private isPumpingQueue: boolean;
  private needsPumpQueue: boolean;
  private readonly listeners: Set<UploadManagerListener>;

  public constructor() {
    this.jobs = new Map();
    this.jobUnsubscribes = new Map();
    this.isPumpingQueue = false;
    this.needsPumpQueue = false;
    this.listeners = new Set();
  }

  public subscribe(listener: UploadManagerListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): UploadManagerSnapshot {
    return {
      uploads: [...this.jobs.values()].map((uploadJob) => uploadJob.getSnapshot()),
    };
  }

  public addFiles(files: File[]) {
    for (const file of files) {
      const newUploadJob = new UploadJob(file);
      const jobId = newUploadJob.getSnapshot().id;

      this.jobs.set(jobId, newUploadJob);
      this.attachJob(newUploadJob);
    }

    this.notify();
    this.pumpQueue();
  }

  public pauseUpload(id: string) {
    this.jobs.get(id)?.pause();
  }

  public resumeUpload(id: string) {
    const jobToResume = this.jobs.get(id);

    if (!jobToResume) {
      return;
    }

    jobToResume.resume();
    this.pumpQueue();
  }

  public cancelUpload(id: string) {
    this.jobs.get(id)?.cancel();
  }

  public removeUpload(id: string) {
    const job = this.jobs.get(id);

    if (!job) {
      return;
    }

    if (!this.canRemoveJob(job)) {
      return;
    }

    this.jobUnsubscribes.get(id)?.();
    this.jobUnsubscribes.delete(id);
    this.jobs.delete(id);
    this.notify();
  }

  private notify() {
    const allJobsSnapshots = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(allJobsSnapshots);
    }
  }

  private pumpQueue() {
    if (this.isPumpingQueue) {
      this.needsPumpQueue = true;
      return;
    }

    this.isPumpingQueue = true;

    const activeJobs = this.getActiveJobs();

    try {
      if (activeJobs.length >= MAX_CONCURRENT_UPLOADS) {
        return;
      }

      const freeActiveJobSlots = MAX_CONCURRENT_UPLOADS - activeJobs.length;
      const queuedJobs = this.getQueuedJobs().slice(0, freeActiveJobSlots);

      for (const job of queuedJobs) {
        void job.start().catch(() => {
          // UploadJob already transitions itself into a terminal state and
          // notifies the manager, so the scheduler only needs to prevent
          // unhandled promise rejections here.
        });
      }
    } finally {
      this.isPumpingQueue = false;

      if (this.needsPumpQueue) {
        this.needsPumpQueue = false;
        this.pumpQueue();
      }
    }
  }

  private attachJob(job: UploadJob) {
    const jobId = job.getSnapshot().id;
    const unsubscribe = job.subscribe(() => {
      this.notify();
      this.pumpQueue();
    });

    this.jobUnsubscribes.set(jobId, unsubscribe);
  }

  private getActiveJobs() {
    return [...this.jobs.values()].filter((job) => {
      const jobSnapshot = job.getSnapshot();

      return ACTIVE_UPLOAD_STATUSES.has(jobSnapshot.status);
    });
  }

  private getQueuedJobs() {
    return [...this.jobs.values()].filter((job) => {
      return job.getSnapshot().status === "queued";
    });
  }

  private canRemoveJob(job: UploadJob) {
    const jobStatus = job.getSnapshot().status;

    return REMOVABLE_UPLOAD_STATUSES.has(jobStatus);
  }
}
