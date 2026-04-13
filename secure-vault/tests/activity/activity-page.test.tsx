import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivityFeedForUser: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/activity/activity-service", () => ({
  getActivityFeedForUser: mocks.getActivityFeedForUser,
}));

import ActivityPage from "@/app/(dashboard)/activity/page";
import { serializeActivityCursor } from "@/lib/activity/activity-types";

describe("activity page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a validated cursor and the current user into the activity service", async () => {
    const cursor = serializeActivityCursor({
      occurredAt: "2026-04-10T10:00:00.000Z",
      sourceId: "link-1",
      sourceKindRank: 20,
    });
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.getActivityFeedForUser.mockResolvedValueOnce({
      entries: [],
      hasMore: false,
      nextCursor: null,
    });

    const element = await ActivityPage({
      searchParams: Promise.resolve({ cursor }),
    });

    expect(mocks.getActivityFeedForUser).toHaveBeenCalledWith({
      cursor: {
        occurredAt: "2026-04-10T10:00:00.000Z",
        sourceId: "link-1",
        sourceKindRank: 20,
      },
      userId: "user-1",
    });
    expect(element).toMatchObject({
      props: expect.objectContaining({
        feed: { entries: [], hasMore: false, nextCursor: null },
        hasCursor: true,
      }),
    });
  });

  it("treats malformed cursor input as page-one input", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.getActivityFeedForUser.mockResolvedValueOnce({
      entries: [],
      hasMore: false,
      nextCursor: null,
    });

    const element = await ActivityPage({
      searchParams: Promise.resolve({ cursor: "not-a-valid-cursor" }),
    });

    expect(mocks.getActivityFeedForUser).toHaveBeenCalledWith({
      cursor: null,
      userId: "user-1",
    });
    expect(element).toMatchObject({
      props: expect.objectContaining({ hasCursor: false }),
    });
  });

  it("safely ignores extra cursor query values and uses the first valid one", async () => {
    const cursor = serializeActivityCursor({
      occurredAt: "2026-04-11T10:00:00.000Z",
      sourceId: "file-2",
      sourceKindRank: 40,
    });
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    mocks.getActivityFeedForUser.mockResolvedValueOnce({
      entries: [],
      hasMore: false,
      nextCursor: null,
    });

    const element = await ActivityPage({
      searchParams: Promise.resolve({ cursor: [cursor, "tampered"] }),
    });

    expect(mocks.getActivityFeedForUser).toHaveBeenCalledWith({
      cursor: {
        occurredAt: "2026-04-11T10:00:00.000Z",
        sourceId: "file-2",
        sourceKindRank: 40,
      },
      userId: "user-1",
    });
    expect(element).toMatchObject({
      props: expect.objectContaining({ hasCursor: true }),
    });
  });

  it("returns an empty feed without calling the service when no user is available", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const element = await ActivityPage({
      searchParams: Promise.resolve({}),
    });

    expect(mocks.getActivityFeedForUser).not.toHaveBeenCalled();
    expect(element).toMatchObject({
      props: {
        feed: {
          entries: [],
          hasMore: false,
          nextCursor: null,
        },
        hasCursor: false,
      },
    });
  });

  it("ignores oversized cursor input when no user is available", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);

    const element = await ActivityPage({
      searchParams: Promise.resolve({ cursor: "a".repeat(4096) }),
    });

    expect(mocks.getActivityFeedForUser).not.toHaveBeenCalled();
    expect(element).toMatchObject({
      props: {
        feed: {
          entries: [],
          hasMore: false,
          nextCursor: null,
        },
        hasCursor: false,
      },
    });
  });
});
