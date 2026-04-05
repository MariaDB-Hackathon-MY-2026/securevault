import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanupExpiredUploads: vi.fn(),
  purgeExpiredTrash: vi.fn(),
}));

vi.mock("@/app/api/files/service", () => ({
  cleanupExpiredUploads: mocks.cleanupExpiredUploads,
  purgeExpiredTrash: mocks.purgeExpiredTrash,
}));

import { GET } from "@/app/api/cron/cleanup/route";

describe("cleanup cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "secret-token";
  });

  it("rejects missing auth headers", async () => {
    const response = await GET(new Request("https://example.com/api/cron/cleanup"));

    expect(response.status).toBe(401);
  });

  it("rejects an incorrect bearer token", async () => {
    const response = await GET(new Request("https://example.com/api/cron/cleanup", {
      headers: { authorization: "Bearer wrong-token" },
    }));

    expect(response.status).toBe(401);
  });

  it("runs trash purge and stale upload cleanup together", async () => {
    mocks.purgeExpiredTrash.mockResolvedValue({
      deletedFiles: 1,
      deletedFolders: 2,
      reclaimedBytes: 4096,
    });
    mocks.cleanupExpiredUploads.mockResolvedValue({
      deletedFiles: 1,
      expiredSessions: 1,
    });

    const response = await GET(new Request("https://example.com/api/cron/cleanup", {
      headers: { authorization: "Bearer secret-token" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trash: {
        deletedFiles: 1,
        deletedFolders: 2,
        reclaimedBytes: 4096,
      },
      uploads: {
        deletedFiles: 1,
        expiredSessions: 1,
      },
    });
  });

  it("returns a zero summary when nothing needs cleanup", async () => {
    mocks.purgeExpiredTrash.mockResolvedValue({
      deletedFiles: 0,
      deletedFolders: 0,
      reclaimedBytes: 0,
    });
    mocks.cleanupExpiredUploads.mockResolvedValue({
      deletedFiles: 0,
      expiredSessions: 0,
    });

    const response = await GET(new Request("https://example.com/api/cron/cleanup", {
      headers: { authorization: "Bearer secret-token" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      trash: {
        deletedFiles: 0,
        deletedFolders: 0,
        reclaimedBytes: 0,
      },
      uploads: {
        deletedFiles: 0,
        expiredSessions: 0,
      },
    });
  });
});
