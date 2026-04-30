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
  getSharedPdfPreviewPageCacheTtlSeconds,
  readCachedSharedPdfPreviewPage,
  writeCachedSharedPdfPreviewPage,
} from "@/lib/pdf-preview/shared-page-cache";

describe("shared pdf preview page cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisState.adapter.reset();
  });

  it("caps ttl at 24 hours for non-expiring or long-lived links", () => {
    const now = new Date("2026-04-27T00:00:00.000Z");

    expect(getSharedPdfPreviewPageCacheTtlSeconds(null, now)).toBe(86_400);
    expect(
      getSharedPdfPreviewPageCacheTtlSeconds(new Date("2026-05-01T00:00:00.000Z"), now),
    ).toBe(86_400);
  });

  it("uses the remaining link lifetime when it is below 24 hours", () => {
    const now = new Date("2026-04-27T00:00:00.000Z");

    expect(
      getSharedPdfPreviewPageCacheTtlSeconds(new Date("2026-04-27T00:15:00.000Z"), now),
    ).toBe(900);
  });

  it("stores and reads cached page bytes", async () => {
    const imageBytes = Buffer.from("cached-preview-page");

    await writeCachedSharedPdfPreviewPage({
      expiresAt: null,
      fileId: "file-1",
      imageBytes,
      pageNumber: 2,
      renderVersion: 3,
      token: "share-token",
    });

    await expect(
      readCachedSharedPdfPreviewPage({
        fileId: "file-1",
        pageNumber: 2,
        renderVersion: 3,
        token: "share-token",
      }),
    ).resolves.toEqual(imageBytes);
  });

  it("expires cached entries when their redis ttl elapses", async () => {
    await writeCachedSharedPdfPreviewPage({
      expiresAt: new Date("1970-01-01T00:15:00.000Z"),
      fileId: "file-1",
      imageBytes: Buffer.from("cached-preview-page"),
      pageNumber: 2,
      renderVersion: 1,
      token: "share-token",
    });

    redisState.adapter.advanceTime(901);

    await expect(
      readCachedSharedPdfPreviewPage({
        fileId: "file-1",
        pageNumber: 2,
        renderVersion: 1,
        token: "share-token",
      }),
    ).resolves.toBeNull();
  });
});
