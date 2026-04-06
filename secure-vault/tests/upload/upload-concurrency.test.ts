import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RedisAdapter, RedisSetOptions } from "@/lib/redis";

const redisState = vi.hoisted(() => {
  class MemoryRedisAdapter implements RedisAdapter {
    private nowMs = 0;
    private readonly store = new Map<string, { expiresAt: number | null; value: string }>();

    advanceTime(seconds: number) {
      this.nowMs += seconds * 1000;
    }

    reset() {
      this.nowMs = 0;
      this.store.clear();
    }

    snapshot(key: string) {
      this.cleanup(key);
      return this.store.get(key) ?? null;
    }

    async get(key: string) {
      this.cleanup(key);
      return this.store.get(key)?.value ?? null;
    }

    async set(key: string, value: string, options: RedisSetOptions = {}) {
      this.cleanup(key);

      if (options.nx && this.store.has(key)) {
        return null;
      }

      if (options.xx && !this.store.has(key)) {
        return null;
      }

      this.store.set(key, {
        expiresAt: typeof options.ex === "number" ? this.nowMs + (options.ex * 1000) : null,
        value,
      });

      return "OK";
    }

    async del(...keys: string[]) {
      let deleted = 0;

      for (const key of keys) {
        this.cleanup(key);

        if (this.store.delete(key)) {
          deleted += 1;
        }
      }

      return deleted;
    }

    async expire(key: string, seconds: number) {
      this.cleanup(key);
      const existing = this.store.get(key);

      if (!existing) {
        return false;
      }

      this.store.set(key, {
        ...existing,
        expiresAt: this.nowMs + (seconds * 1000),
      });

      return true;
    }

    async incr(key: string) {
      this.cleanup(key);
      const existing = this.store.get(key);
      const currentValue = existing ? Number(existing.value) : 0;
      const nextValue = currentValue + 1;

      this.store.set(key, {
        expiresAt: existing?.expiresAt ?? null,
        value: String(nextValue),
      });

      return nextValue;
    }

    async ttl(key: string) {
      this.cleanup(key);
      const existing = this.store.get(key);

      if (!existing) {
        return -2;
      }

      if (existing.expiresAt == null) {
        return -1;
      }

      return Math.max(0, Math.ceil((existing.expiresAt - this.nowMs) / 1000));
    }

    private cleanup(key: string) {
      const existing = this.store.get(key);

      if (!existing || existing.expiresAt == null) {
        return;
      }

      if (existing.expiresAt <= this.nowMs) {
        this.store.delete(key);
      }
    }
  }

  return {
    adapter: new MemoryRedisAdapter(),
  };
});

vi.mock("@/lib/redis", () => ({
  getRedisAdapter: vi.fn(async () => redisState.adapter),
}));

import {
  claimUploadSlot,
  releaseUploadSlot,
} from "@/lib/upload/upload-concurrency";

const USER_ID = "user-1";

function readActiveUploadsRecord() {
  const record = redisState.adapter.snapshot(`upload:active:${USER_ID}`);

  return record ? JSON.parse(record.value) as { count: number; uploadIds: string[] } : null;
}

describe("upload concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisState.adapter.reset();
  });

  it("claims a slot when the user is below the global limit", async () => {
    const result = await claimUploadSlot({
      uploadId: "upload-1",
      userId: USER_ID,
    });

    expect(result).toEqual({
      activeCount: 1,
      maxActiveUploads: 3,
      retryAfterSeconds: 90,
      success: true,
    });
    expect(readActiveUploadsRecord()).toEqual({
      count: 1,
      uploadIds: ["upload-1"],
    });
    await expect(redisState.adapter.get("upload:lease:upload-1")).resolves.toBe(USER_ID);
  });

  it("treats repeated claims for the same upload as idempotent", async () => {
    await claimUploadSlot({
      uploadId: "upload-1",
      userId: USER_ID,
    });

    const result = await claimUploadSlot({
      uploadId: "upload-1",
      userId: USER_ID,
    });

    expect(result.success).toBe(true);
    expect(result.activeCount).toBe(1);
    expect(readActiveUploadsRecord()).toEqual({
      count: 1,
      uploadIds: ["upload-1"],
    });
  });

  it("rejects the fourth concurrent upload and reports a retry window", async () => {
    await claimUploadSlot({ uploadId: "upload-1", userId: USER_ID });
    await claimUploadSlot({ uploadId: "upload-2", userId: USER_ID });
    await claimUploadSlot({ uploadId: "upload-3", userId: USER_ID });

    redisState.adapter.advanceTime(12);

    const result = await claimUploadSlot({
      uploadId: "upload-4",
      userId: USER_ID,
    });

    expect(result).toEqual({
      activeCount: 3,
      maxActiveUploads: 3,
      retryAfterSeconds: 78,
      success: false,
    });
    expect(readActiveUploadsRecord()).toEqual({
      count: 3,
      uploadIds: ["upload-1", "upload-2", "upload-3"],
    });
  });

  it("releases a slot exactly once and leaves double release as a no-op", async () => {
    await claimUploadSlot({ uploadId: "upload-1", userId: USER_ID });
    await claimUploadSlot({ uploadId: "upload-2", userId: USER_ID });

    await releaseUploadSlot({
      uploadId: "upload-1",
      userId: USER_ID,
    });

    expect(readActiveUploadsRecord()).toEqual({
      count: 1,
      uploadIds: ["upload-2"],
    });
    await expect(redisState.adapter.get("upload:lease:upload-1")).resolves.toBeNull();

    await releaseUploadSlot({
      uploadId: "upload-1",
      userId: USER_ID,
    });

    expect(readActiveUploadsRecord()).toEqual({
      count: 1,
      uploadIds: ["upload-2"],
    });
  });

  it("repairs stale counters so expired leases do not permanently block uploads", async () => {
    await redisState.adapter.set(
      "upload:active:user-1",
      JSON.stringify({
        count: 3,
        uploadIds: ["stale-1", "stale-2", "stale-3"],
      }),
      { ex: 180 },
    );

    const result = await claimUploadSlot({
      uploadId: "upload-fresh",
      userId: USER_ID,
    });

    expect(result).toEqual({
      activeCount: 1,
      maxActiveUploads: 3,
      retryAfterSeconds: 90,
      success: true,
    });
    expect(readActiveUploadsRecord()).toEqual({
      count: 1,
      uploadIds: ["upload-fresh"],
    });
  });
});
