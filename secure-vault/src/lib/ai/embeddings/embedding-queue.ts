import "server-only";

import { createClient, type RedisClientType } from "redis";

import { getSemanticConfig } from "@/lib/ai/config";
import type { EmbeddingModality } from "@/lib/ai/embeddings/types";

export type EmbeddingQueueMessage = {
  attemptCount: number;
  fileId: string;
  jobId: string;
  modality: EmbeddingModality;
};

const EMBEDDING_QUEUE_NAME = "semantic:embedding:jobs";

let clientPromise: Promise<RedisClientType> | null = null;

async function getRedisClient() {
  if (!clientPromise) {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      throw new Error("Redis is required for queued semantic indexing.");
    }

    clientPromise = (async () => {
      const client = createClient({ url: redisUrl });
      client.on("error", (error) => {
        console.error("Embedding queue Redis error", error);
      });
      await client.connect();
      return client;
    })();
  }

  return clientPromise;
}

export async function enqueueEmbeddingMessage(message: EmbeddingQueueMessage) {
  const client = await getRedisClient() as unknown as {
    sendCommand(command: string[]): Promise<unknown>;
  };
  await client.sendCommand(["RPUSH", EMBEDDING_QUEUE_NAME, JSON.stringify(message)]);
}

export async function dequeueEmbeddingMessage(signal?: AbortSignal): Promise<EmbeddingQueueMessage | null> {
  if (signal?.aborted) {
    return null;
  }

  const client = await getRedisClient() as unknown as {
    sendCommand(command: string[]): Promise<unknown>;
  };
  const timeoutSeconds = Math.max(1, Math.floor(getSemanticConfig().embeddingRequestTimeoutMs / 1_000));
  const result = await client.sendCommand(["BLPOP", EMBEDDING_QUEUE_NAME, String(timeoutSeconds)]) as unknown as [string, string] | null;

  if (!result) {
    return null;
  }

  return JSON.parse(result[1]) as EmbeddingQueueMessage;
}

export async function closeEmbeddingQueueForTests() {
  if (!clientPromise) {
    return;
  }

  const client = await clientPromise;
  await client.quit();
  clientPromise = null;
}
