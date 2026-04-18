import "server-only";

import { GoogleGenAI } from "@google/genai";

import { getSemanticConfig } from "@/lib/ai/config";
import type {
  EmbedBinaryInput,
  EmbedTextInput,
  EmbeddingProvider,
} from "@/lib/ai/providers/types";

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

export function createGoogleEmbeddingProvider(): EmbeddingProvider {
  const config = getSemanticConfig();

  if (!config.geminiApiKey) {
    throw new Error("Missing Gemini API key for Google embedding provider.");
  }

  const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

  return {
    async embedBinary(input) {
      return withTimeout(config.embeddingRequestTimeoutMs, async () => {
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
      });
    },
    async embedText(input) {
      return withTimeout(config.embeddingRequestTimeoutMs, async () => {
        const response = await client.models.embedContent({
          config: {
            outputDimensionality: config.embeddingDimensions,
            taskType: getTaskType(input.task),
          },
          contents: input.text,
          model: config.geminiEmbeddingModel,
        });

        return response.embeddings?.[0]?.values ?? [];
      });
    },
    id: "google",
  };
}
