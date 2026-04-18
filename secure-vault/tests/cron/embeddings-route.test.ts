import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSemanticConfig: vi.fn(),
  requeueRetryCandidates: vi.fn(),
}));

vi.mock("@/lib/ai/config", () => ({
  getSemanticConfig: mocks.getSemanticConfig,
}));

vi.mock("@/lib/ai/embeddings/embedding-job-service", () => ({
  EmbeddingJobService: class {
    requeueRetryCandidates = mocks.requeueRetryCandidates;
  },
}));

import { POST } from "@/app/api/cron/embeddings/route";

describe("cron embeddings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "secret-token";
    mocks.getSemanticConfig.mockReturnValue({ enabled: true });
  });

  it("rejects missing auth headers", async () => {
    const response = await POST(new Request("https://example.com/api/cron/embeddings"));

    expect(response.status).toBe(403);
  });

  it("passes the parsed limit to the retry sweep", async () => {
    mocks.requeueRetryCandidates.mockResolvedValueOnce({
      dispatchFailures: 0,
      requeued: 2,
      scanned: 4,
      skipped: 2,
    });

    const response = await POST(new Request("https://example.com/api/cron/embeddings?limit=10", {
      headers: { authorization: "Bearer secret-token" },
      method: "POST",
    }));

    expect(response.status).toBe(200);
    expect(mocks.requeueRetryCandidates).toHaveBeenCalledWith(10);
    await expect(response.json()).resolves.toEqual({
      dispatchFailures: 0,
      requeued: 2,
      scanned: 4,
      skipped: 2,
    });
  });

  it("returns 503 when semantic indexing is disabled", async () => {
    mocks.getSemanticConfig.mockReturnValueOnce({ enabled: false });

    const response = await POST(new Request("https://example.com/api/cron/embeddings", {
      headers: { authorization: "Bearer secret-token" },
      method: "POST",
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: "SEMANTIC_INDEXING_DISABLED",
    });
  });
});
