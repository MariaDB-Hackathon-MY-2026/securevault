import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRateLimitResponse: vi.fn(),
  enforceRateLimit: vi.fn(),
  getCurrentUser: vi.fn(),
  releaseUploadSlot: vi.fn(),
  requireOwnedUploadSession: vi.fn(),
  validateUploadSlotBody: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");

  return {
    ...actual,
    createRateLimitResponse: mocks.createRateLimitResponse,
    enforceRateLimit: mocks.enforceRateLimit,
  };
});

vi.mock("@/lib/upload/upload-concurrency", () => ({
  UploadConcurrencyError: class UploadConcurrencyError extends Error {
    retryAfterSeconds: number | null;
    status: number;

    constructor(message: string, status: number, retryAfterSeconds?: number | null) {
      super(message);
      this.retryAfterSeconds = retryAfterSeconds ?? null;
      this.status = status;
    }
  },
  releaseUploadSlot: mocks.releaseUploadSlot,
  requireOwnedUploadSession: mocks.requireOwnedUploadSession,
  validateUploadSlotBody: mocks.validateUploadSlotBody,
}));

import { POST } from "@/app/api/upload/release/route";

function createUser() {
  return {
    created_at: new Date("2026-03-20T00:00:00.000Z"),
    email: "alice@example.com",
    email_verified: true,
    id: "user-1",
    name: "Alice",
    storage_quota: 1024,
    storage_used: 0,
    uek: Buffer.alloc(32, 1),
  };
}

function createRequest(body: unknown) {
  return new Request("https://example.com/api/upload/release", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }) as never;
}

describe("upload release route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(createUser());
    mocks.enforceRateLimit.mockResolvedValue({ success: true });
    mocks.validateUploadSlotBody.mockReturnValue({ uploadId: "upload-1" });
    mocks.requireOwnedUploadSession.mockResolvedValue({ id: "upload-1" });
    mocks.releaseUploadSlot.mockResolvedValue(undefined);
    mocks.createRateLimitResponse.mockReturnValue(
      new Response(JSON.stringify({ message: "rate limited" }), { status: 429 }),
    );
  });

  it("returns 200 when the upload slot is released", async () => {
    const response = await POST(createRequest({ uploadId: "upload-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      released: true,
      uploadId: "upload-1",
    });
    expect(mocks.releaseUploadSlot).toHaveBeenCalledWith({
      uploadId: "upload-1",
      userId: "user-1",
    });
  });

  it("returns the shared rate-limit response when the route is rate limited", async () => {
    const limitedResponse = new Response(JSON.stringify({ message: "Too many upload requests" }), {
      headers: { "Retry-After": "60" },
      status: 429,
    });
    mocks.enforceRateLimit.mockResolvedValueOnce({ success: false });
    mocks.createRateLimitResponse.mockReturnValueOnce(limitedResponse);

    const response = await POST(createRequest({ uploadId: "upload-1" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.releaseUploadSlot).not.toHaveBeenCalled();
  });
});
