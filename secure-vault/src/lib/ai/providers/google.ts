import "server-only";

import { GoogleGenAI } from "@google/genai";

import { getSemanticConfig } from "@/lib/ai/config";
import type {
  EmbedBinaryInput,
  EmbedTextInput,
  EmbeddingProvider,
} from "@/lib/ai/providers/types";

const DEFAULT_MAX_ATTEMPTS = 6;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 15_000;
const RETRYABLE_PROVIDER_CODES = new Set(["429", "500", "502", "503", "504"]);
const RETRYABLE_PROVIDER_STATUSES = new Set([
  "DEADLINE_EXCEEDED",
  "INTERNAL",
  "RESOURCE_EXHAUSTED",
  "UNAVAILABLE",
]);

function createTimeoutSignal(timeoutMs: number) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort(new DOMException("Embedding provider timeout", "AbortError"));
  }, timeoutMs);

  return {
    clear: () => {
      clearTimeout(timeout);
    },
    signal: abortController.signal,
  };
}

function getTaskType(task: EmbedTextInput["task"] | EmbedBinaryInput["task"]) {
  return task === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
}

async function withTimeout<T>(timeoutMs: number, operation: () => Promise<T>) {
  const timeout = createTimeoutSignal(timeoutMs);

  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeout.signal.addEventListener("abort", () => {
          reject(timeout.signal.reason);
        }, { once: true });
      }),
    ]);
  } finally {
    timeout.clear();
  }
}

function tryParseJsonMessage(message: string) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage.startsWith("{") || !trimmedMessage.endsWith("}")) {
    return null;
  }

  try {
    return JSON.parse(trimmedMessage) as unknown;
  } catch {
    return null;
  }
}

function collectRetrySignals(error: unknown, signals = new Set<string>()) {
  if (!error || typeof error !== "object") {
    return signals;
  }

  const maybeError = error as {
    cause?: unknown;
    code?: number | string;
    error?: unknown;
    message?: string;
    status?: number | string;
  };

  if (typeof maybeError.code === "number" || typeof maybeError.code === "string") {
    signals.add(String(maybeError.code).toUpperCase());
  }

  if (typeof maybeError.status === "number" || typeof maybeError.status === "string") {
    signals.add(String(maybeError.status).toUpperCase());
  }

  if (typeof maybeError.message === "string") {
    const normalizedMessage = maybeError.message.toUpperCase();
    signals.add(normalizedMessage);

    const parsedMessage = tryParseJsonMessage(maybeError.message);
    if (parsedMessage) {
      collectRetrySignals(parsedMessage, signals);
    }
  }

  if ("error" in maybeError) {
    collectRetrySignals(maybeError.error, signals);
  }

  if ("cause" in maybeError) {
    collectRetrySignals(maybeError.cause, signals);
  }

  return signals;
}

function isRetryableProviderError(error: unknown) {
  const retrySignals = collectRetrySignals(error);

  for (const signal of retrySignals) {
    if (RETRYABLE_PROVIDER_CODES.has(signal) || RETRYABLE_PROVIDER_STATUSES.has(signal)) {
      return true;
    }

    if (
      signal.includes("429")
      || signal.includes("DEADLINE_EXCEEDED")
      || signal.includes("INTERNAL")
      || signal.includes("QUOTA")
      || signal.includes("RESOURCE_EXHAUSTED")
      || signal.includes("UNAVAILABLE")
    ) {
      return true;
    }
  }

  return false;
}

function getRetryDelayMs(attempt: number) {
  return Math.min(INITIAL_RETRY_DELAY_MS * (2 ** (attempt - 1)), MAX_RETRY_DELAY_MS);
}

async function sleep(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableProviderError(error) || attempt === DEFAULT_MAX_ATTEMPTS) {
        throw error;
      }

      await sleep(getRetryDelayMs(attempt));
    }
  }

  throw new Error("Embedding provider retry loop exited unexpectedly.");
}

export function createGoogleEmbeddingProvider(): EmbeddingProvider {
  const config = getSemanticConfig();

  if (!config.geminiApiKey) {
    throw new Error("Missing Gemini API key for Google embedding provider.");
  }

  const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

  return {
    async embedBinary(input) {
      return withRetry(() =>
        withTimeout(config.embeddingRequestTimeoutMs, async () => {
          const response = await client.models.embedContent({
            config: {
              outputDimensionality: config.embeddingDimensions,
              taskType: getTaskType(input.task),
            },
            contents: [
              { text: input.contextText },
              {
                inlineData: {
                  data: input.bytes.toString("base64"),
                  mimeType: input.mimeType,
                },
              },
            ],
            model: config.geminiEmbeddingModel,
          });

          return response.embeddings?.[0]?.values ?? [];
        }),
      );
    },
    async embedText(input) {
      return withRetry(() =>
        withTimeout(config.embeddingRequestTimeoutMs, async () => {
          const response = await client.models.embedContent({
            config: {
              outputDimensionality: config.embeddingDimensions,
              taskType: getTaskType(input.task),
            },
            contents: input.text,
            model: config.geminiEmbeddingModel,
          });

          return response.embeddings?.[0]?.values ?? [];
        }),
      );
    },
    id: "google",
  };
}
