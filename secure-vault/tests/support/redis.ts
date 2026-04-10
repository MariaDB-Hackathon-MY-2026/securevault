type RedisClientStub = {
  connect: () => Promise<void>;
  del: (...keys: string[]) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  get: (key: string) => Promise<string | null>;
  incr: (key: string) => Promise<number>;
  isOpen: boolean;
  on: (event: string, listener: (...args: unknown[]) => void) => RedisClientStub;
  set: (key: string, value: string, options?: Record<string, unknown>) => Promise<string | null>;
  ttl: (key: string) => Promise<number>;
};

export function createClient(): RedisClientStub {
  return {
    async connect() {
      return undefined;
    },
    async del() {
      return 0;
    },
    async expire() {
      return 1;
    },
    async get() {
      return null;
    },
    async incr() {
      return 1;
    },
    isOpen: true,
    on() {
      return this;
    },
    async set() {
      return "OK";
    },
    async ttl() {
      return 60;
    },
  };
}
