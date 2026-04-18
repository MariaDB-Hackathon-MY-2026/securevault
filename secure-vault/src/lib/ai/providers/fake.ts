import "server-only";

import { createHash } from "node:crypto";

import type {
  EmbedBinaryInput,
  EmbedTextInput,
  EmbeddingProvider,
} from "@/lib/ai/providers/types";
import { normalizeVector } from "@/lib/ai/embeddings/vector";

const VECTOR_DIMENSIONS = 1536;
const TOKEN_DIMENSIONS = 256;

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function tokenToBucket(token: string) {
  const digest = createHash("sha256").update(token).digest();
  return digest.readUInt16BE(0) % TOKEN_DIMENSIONS;
}

function addHashedSignal(vector: number[], input: string, weight: number) {
  const digest = createHash("sha256").update(input).digest();

  for (let index = 0; index < digest.length; index += 1) {
    const bucket = digest[index] % vector.length;
    const signedValue = (digest[index] / 255) * 2 - 1;
    vector[bucket] += signedValue * weight;
  }
}

function buildDeterministicVector(seed: {
  bytes?: Buffer;
  contextText?: string;
  text?: string;
}) {
  const vector = new Array<number>(VECTOR_DIMENSIONS).fill(0);
  const tokenSource = [seed.text, seed.contextText]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");

  for (const token of tokenize(tokenSource)) {
    vector[tokenToBucket(token)] += 1;
  }

  if (seed.contextText) {
    addHashedSignal(vector, `context:${seed.contextText}`, 0.25);
  }

  if (seed.text) {
    addHashedSignal(vector, `text:${seed.text}`, 0.25);
  }

  if (seed.bytes) {
    addHashedSignal(vector, `bytes:${createHash("sha256").update(seed.bytes).digest("hex")}`, 0.2);
  }

  return normalizeVector(vector);
}

async function embedText(input: EmbedTextInput) {
  return buildDeterministicVector({
    text: input.text,
  });
}

async function embedBinary(input: EmbedBinaryInput) {
  return buildDeterministicVector({
    bytes: input.bytes,
    contextText: input.contextText,
  });
}

export function createFakeEmbeddingProvider(): EmbeddingProvider {
  return {
    embedBinary,
    embedText,
    id: "fake",
  };
}
