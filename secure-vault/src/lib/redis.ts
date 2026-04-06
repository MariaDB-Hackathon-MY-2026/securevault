import { createClient, type RedisClientType } from "redis";

const REDIS_CONNECT_TIMEOUT_MS = 1_000;
const REDIS_MAX_RECONNECT_DELAY_MS = 250;
const REDIS_MAX_RECONNECT_ATTEMPTS = 2;

export type RedisSetOptions = {
  ex?: number;
  nx?: boolean;
  xx?: boolean;
};

export interface RedisAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
}

function isRedisDebugEnabled() {
  return process.env.REDIS_DEBUG_TIMING === "1" || process.env.REDIS_DEBUG_TIMING === "true";
}

function logRedisDebug(message: string, durationMs?: number) {
  if (!isRedisDebugEnabled()) {
    return;
  }

  if (typeof durationMs === "number") {
    console.info(`[redis-debug] ${message} (${durationMs.toFixed(1)}ms)`);
    return;
  }

  console.info(`[redis-debug] ${message}`);
}

class NodeRedisAdapter implements RedisAdapter {
  private readonly client: RedisClientType;
  private connectPromise: Promise<void> | null;

  constructor(url: string) {
    this.client = createClient({
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy(retries) {
          if (retries >= REDIS_MAX_RECONNECT_ATTEMPTS) {
            return new Error("Redis reconnect retries exhausted");
          }

          return Math.min(retries * 50, REDIS_MAX_RECONNECT_DELAY_MS);
        },
      },
      url,
    });
    this.connectPromise = null;
    this.client.on("error", (error) => {
      console.error("Node Redis client error", error);
    });
  }

  async get(key: string) {
    return this.measure(`GET ${key}`, async () => {
      await this.ensureConnected();
      return this.client.get(key);
    });
  }

  async set(key: string, value: string, options: RedisSetOptions = {}) {
    return this.measure(`SET ${key}`, async () => {
      await this.ensureConnected();

      const result = await this.client.set(key, value, {
        EX: options.ex,
        NX: options.nx ? true : undefined,
        XX: options.xx ? true : undefined,
      });

      return result === null ? null : "OK";
    });
  }

  async del(...keys: string[]) {
    if (keys.length === 0) {
      return 0;
    }

    return this.measure(`DEL ${keys.join(",")}`, async () => {
      await this.ensureConnected();
      return this.client.del(keys);
    });
  }

  async expire(key: string, seconds: number) {
    return this.measure(`EXPIRE ${key}`, async () => {
      await this.ensureConnected();
      return (await this.client.expire(key, seconds)) === 1;
    });
  }

  async incr(key: string) {
    return this.measure(`INCR ${key}`, async () => {
      await this.ensureConnected();
      return this.client.incr(key);
    });
  }

  async ttl(key: string) {
    return this.measure(`TTL ${key}`, async () => {
      await this.ensureConnected();
      return this.client.ttl(key);
    });
  }

  private async ensureConnected() {
    if (this.client.isOpen) {
      return;
    }

    if (!this.connectPromise) {
      logRedisDebug("Opening Redis connection");
      const startedAt = performance.now();
      this.connectPromise = this.client
        .connect()
        .then(() => undefined)
        .then((result) => {
          logRedisDebug("Redis connection opened", performance.now() - startedAt);
          return result;
        })
        .catch((error) => {
          logRedisDebug("Redis connection failed", performance.now() - startedAt);
          throw error;
        })
        .finally(() => {
          this.connectPromise = null;
        });
    }

    await this.connectPromise;
  }

  private async measure<T>(label: string, operation: () => Promise<T>) {
    if (!isRedisDebugEnabled()) {
      return operation();
    }

    const startedAt = performance.now();

    try {
      return await operation();
    } finally {
      logRedisDebug(label, performance.now() - startedAt);
    }
  }
}

class NoopRedisAdapter implements RedisAdapter {
  async get() {
    return null;
  }

  async set() {
    return "OK" as const;
  }

  async del() {
    return 0;
  }

  async expire() {
    return true;
  }

  async incr() {
    return 1;
  }

  async ttl() {
    return 60;
  }
}

let cachedAdapter: RedisAdapter | null = null;

export function hasRedisConfiguration() {
  return !shouldDisableRedis() && Boolean(process.env.REDIS_URL?.trim());
}

export function isTestEnvironment() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

export function isDevelopmentEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export function shouldDisableRedis() {
  return process.env.DISABLE_REDIS === "1" || process.env.DISABLE_REDIS === "true";
}

export async function getRedisAdapter(): Promise<RedisAdapter> {
  if (cachedAdapter) {
    logRedisDebug("Using cached Redis adapter");
    return cachedAdapter;
  }

  if (shouldDisableRedis()) {
    console.warn("Redis is disabled by DISABLE_REDIS; using a no-op adapter.");
    cachedAdapter = new NoopRedisAdapter();
    return cachedAdapter;
  }

  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    cachedAdapter = new NodeRedisAdapter(redisUrl);
    return cachedAdapter;
  }

  if (isDevelopmentEnvironment() || isTestEnvironment()) {
    console.warn("Redis is not configured; using a no-op adapter outside production.");
    cachedAdapter = new NoopRedisAdapter();
    return cachedAdapter;
  }

  throw new Error(
    "Redis is not configured. Set REDIS_URL.",
  );
}

export function resetRedisAdapterForTests() {
  cachedAdapter = null;
}
