declare module "resend" {
  export type ResendEmailPayload = {
    from: string;
    html: string;
    subject: string;
    to: string | string[];
  };

  export class Resend {
    constructor(apiKey?: string);

    emails: {
      send(payload: ResendEmailPayload): Promise<{ error: { message: string } | null }>;
    };
  }
}

declare module "redis" {
  export type RedisScanIteratorOptions = {
    COUNT?: number;
    MATCH?: string;
  };

  export type RedisClientType = {
    connect(): Promise<void>;
    del(keys: string[] | string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    get(key: string): Promise<string | null>;
    incr(key: string): Promise<number>;
    isOpen: boolean;
    on(event: string, listener: (error: unknown) => void): RedisClientType;
    quit(): Promise<void>;
    scanIterator(options?: RedisScanIteratorOptions): AsyncIterable<string[]>;
    set(
      key: string,
      value: string,
      options?: {
        EX?: number;
        NX?: true;
        XX?: true;
      },
    ): Promise<string | null>;
    ttl(key: string): Promise<number>;
  };

  export function createClient(options?: {
    socket?: {
      connectTimeout?: number;
      reconnectStrategy?: (retries: number) => number | Error;
    };
    url?: string;
  }): RedisClientType;
}
