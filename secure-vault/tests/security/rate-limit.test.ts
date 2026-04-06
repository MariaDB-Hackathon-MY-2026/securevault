import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  let shouldThrow = false;

  return {
    counts,
    reset() {
      counts.clear();
      ttls.clear();
      shouldThrow = false;
    },
    setShouldThrow(nextValue: boolean) {
      shouldThrow = nextValue;
    },
    shouldThrow() {
      return shouldThrow;
    },
    ttls,
  };
});

vi.mock("@/lib/redis", () => ({
  getRedisAdapter: vi.fn(async () => ({
    del: vi.fn(async () => 0),
    expire: vi.fn(async (key: string, seconds: number) => {
      if (state.shouldThrow()) {
        throw new Error("redis unavailable");
      }
      state.ttls.set(key, seconds);
      return true;
    }),
    get: vi.fn(async () => null),
    incr: vi.fn(async (key: string) => {
      if (state.shouldThrow()) {
        throw new Error("redis unavailable");
      }
      const nextCount = (state.counts.get(key) ?? 0) + 1;

      state.counts.set(key, nextCount);
      return nextCount;
    }),
    set: vi.fn(async () => "OK"),
    ttl: vi.fn(async (key: string) => {
      if (state.shouldThrow()) {
        throw new Error("redis unavailable");
      }

      return state.ttls.get(key) ?? 60;
    }),
  })),
}));

import {
  createRateLimitResponse,
  enforceRateLimit,
  loginLimiter,
} from "@/lib/rate-limit";

describe("rate limit helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.reset();
  });

  it("returns success metadata while requests stay within the fixed window", async () => {
    const result = await enforceRateLimit(loginLimiter, "203.0.113.10:alice@example.com");

    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(result.headers.get("Retry-After")).toBe("900");
  });

  it("returns a 429 response helper with Retry-After after the limit is exceeded", async () => {
    const key = "203.0.113.10:alice@example.com";

    for (let attempt = 0; attempt < loginLimiter.limit; attempt += 1) {
      await enforceRateLimit(loginLimiter, key);
    }

    const blocked = await enforceRateLimit(loginLimiter, key);
    const response = createRateLimitResponse(blocked, loginLimiter.message);

    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    await expect(response.json()).resolves.toEqual({
      message: "Too many attempts. Please try again later.",
    });
  });

  it("fails open when redis is unavailable so auth does not block on rate limiting", async () => {
    state.setShouldThrow(true);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await enforceRateLimit(loginLimiter, "203.0.113.10:alice@example.com");

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(loginLimiter.limit);
    expect(result.headers.get("Retry-After")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
