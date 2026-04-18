import "server-only";

import type { SemanticProviderId } from "@/lib/ai/config";

export type SemanticProviderTask = "document" | "query";

export type EmbedBinaryInput = {
  bytes: Buffer;
  contextText: string;
  mimeType: string;
  task: SemanticProviderTask;
};

export type EmbedTextInput = {
  task: SemanticProviderTask;
  text: string;
};

export type EmbeddingProvider = {
  id: SemanticProviderId;
  embedBinary(input: EmbedBinaryInput): Promise<number[]>;
  embedText(input: EmbedTextInput): Promise<number[]>;
};
