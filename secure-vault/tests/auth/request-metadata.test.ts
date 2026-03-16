import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

import { getRequestMetaData } from "@/lib/auth/request-metadata";

describe("getRequestMetaData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a concise browser and platform label instead of the raw user agent", async () => {
    mocks.headers.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === "user-agent") {
          return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
        }

        if (name === "x-real-ip") {
          return "203.0.113.10";
        }

        return undefined;
      }),
    });

    await expect(getRequestMetaData()).resolves.toEqual({
      device_name: "Chrome on Windows",
      ip_address: "203.0.113.10",
    });
  });

  it("uses the first forwarded IP and a safe fallback for unknown agents", async () => {
    mocks.headers.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === "user-agent") {
          return "UnknownAgent/1.0";
        }

        if (name === "x-forwarded-for") {
          return "198.51.100.1, 198.51.100.2";
        }

        return undefined;
      }),
    });

    await expect(getRequestMetaData()).resolves.toEqual({
      device_name: "Unknown browser on Unknown device",
      ip_address: "198.51.100.1",
    });
  });

  it("keeps the device name within the sessions.device_name limit", async () => {
    mocks.headers.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === "user-agent") {
          return "Mozilla/5.0 (X11; Linux x86_64) Firefox/145.0";
        }

        return undefined;
      }),
    });

    const result = await getRequestMetaData();

    expect(result.device_name).toBe("Firefox on Linux");
    expect(result.device_name.length).toBeLessThanOrEqual(50);
  });
});
