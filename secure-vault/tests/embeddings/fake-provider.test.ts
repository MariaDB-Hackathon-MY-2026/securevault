import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSemanticConfigForTests } from "@/lib/ai/config";
import { createFakeEmbeddingProvider } from "@/lib/ai/providers/fake";

describe("fake embedding provider", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "true");
    process.env.SEMANTIC_INDEXING_ENABLED = "true";
    process.env.SEMANTIC_INDEXING_PROVIDER = "fake";
    resetSemanticConfigForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSemanticConfigForTests();
  });

  it("returns deterministic vectors for identical text input", async () => {
    const provider = createFakeEmbeddingProvider();

    await expect(provider.embedText({ task: "query", text: "task: search result | query: report" }))
      .resolves.toEqual(
        await provider.embedText({ task: "query", text: "task: search result | query: report" }),
      );
  });

  it("returns normalized vectors for binary input", async () => {
    const provider = createFakeEmbeddingProvider();
    const values = await provider.embedBinary({
      bytes: Buffer.from("demo-bytes"),
      contextText: "document section: file | text: none",
      mimeType: "application/pdf",
      task: "document",
    });
    const norm = Math.sqrt(values.reduce((sum, value) => sum + (value * value), 0));

    expect(values).toHaveLength(1536);
    expect(norm).toBeCloseTo(1, 6);
  });
});
