import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("redis", () => ({
  createClient: mocks.createClient,
}));

import { getRedisAdapter, resetRedisAdapterForTests } from "@/lib/redis";

describe("redis adapter selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRedisAdapterForTests();
    delete process.env.REDIS_URL;
    delete process.env.DISABLE_REDIS;
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "true");

    mocks.createClient.mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(0),
      expire: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue("node-value"),
      incr: vi.fn().mockResolvedValue(1),
      isOpen: false,
      on: vi.fn(),
      set: vi.fn().mockResolvedValue("OK"),
      ttl: vi.fn().mockResolvedValue(60),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the node redis adapter when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:6379";

    const adapter = await getRedisAdapter();
    const value = await adapter.get("demo");
    const createClientConfig = mocks.createClient.mock.calls[0]?.[0] as {
      socket?: { reconnectStrategy?: (retries: number) => number | Error };
    };

    expect(value).toBe("node-value");
    expect(mocks.createClient).toHaveBeenCalledWith({
      socket: {
        connectTimeout: 1000,
        reconnectStrategy: expect.any(Function),
      },
      url: "redis://127.0.0.1:6379",
    });
    expect(createClientConfig.socket?.reconnectStrategy?.(0)).toBe(0);
    expect(createClientConfig.socket?.reconnectStrategy?.(1)).toBe(50);
    expect(createClientConfig.socket?.reconnectStrategy?.(2)).toBeInstanceOf(Error);
  });

  it("throws a clear error outside tests when no Redis configuration is present", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
    resetRedisAdapterForTests();

    await expect(getRedisAdapter()).rejects.toThrow(
      "Redis is not configured. Set REDIS_URL.",
    );
  });

  it("uses the noop adapter in development when REDIS_URL is not set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITEST", "");
    resetRedisAdapterForTests();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const adapter = await getRedisAdapter();

    await expect(adapter.incr("demo")).resolves.toBe(1);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("uses the noop adapter when DISABLE_REDIS is set even if REDIS_URL exists", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITEST", "");
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    process.env.DISABLE_REDIS = "true";
    resetRedisAdapterForTests();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const adapter = await getRedisAdapter();

    await expect(adapter.incr("demo")).resolves.toBe(1);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "Redis is disabled by DISABLE_REDIS; using a no-op adapter.",
    );
  });
});
