import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSemanticConfig, resetSemanticConfigForTests } from "@/lib/ai/config";

describe("semantic config", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "true");
    process.env.SEMANTIC_INDEXING_ENABLED = "true";
    process.env.SEMANTIC_INDEXING_EXECUTION_MODE = "inline";
    process.env.SEMANTIC_INDEXING_PROVIDER = "fake";
    delete process.env.GEMINI_API_KEY;
    resetSemanticConfigForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetSemanticConfigForTests();
  });

  it("uses the v1 defaults when env values are omitted", () => {
    const config = getSemanticConfig();

    expect(config.embeddingDimensions).toBe(1536);
    expect(config.maxScoreGap).toBe(0.05);
    expect(config.minSimilarity).toBe(0.35);
    expect(config.pdfFullEmbedMaxPages).toBe(6);
    expect(config.pdfWindowSizePages).toBe(6);
    expect(config.pdfWindowOverlapPages).toBe(1);
    expect(config.queryTopK).toBe(50);
  });

  it("allows overriding the minimum similarity threshold", () => {
    process.env.SEMANTIC_INDEXING_MIN_SIMILARITY = "0.6";
    resetSemanticConfigForTests();

    expect(getSemanticConfig().minSimilarity).toBe(0.6);
  });

  it("allows overriding the maximum score gap threshold", () => {
    process.env.SEMANTIC_INDEXING_MAX_SCORE_GAP = "0.02";
    resetSemanticConfigForTests();

    expect(getSemanticConfig().maxScoreGap).toBe(0.02);
  });

  it("allows disabled mode without provider credentials", () => {
    process.env.SEMANTIC_INDEXING_ENABLED = "false";
    process.env.SEMANTIC_INDEXING_PROVIDER = "google";
    resetSemanticConfigForTests();

    expect(getSemanticConfig().enabled).toBe(false);
  });

  it("rejects invalid v1 page window settings", () => {
    process.env.PDF_WINDOW_OVERLAP_PAGES = "2";
    resetSemanticConfigForTests();

    expect(() => getSemanticConfig()).toThrow(
      "PDF_WINDOW_OVERLAP_PAGES must be 1 for the v1 semantic indexing contract.",
    );
  });
});
