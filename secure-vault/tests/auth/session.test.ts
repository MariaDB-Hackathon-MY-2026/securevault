import { beforeEach, describe, expect, it, vi } from "vitest";

const fixedNow = new Date("2026-03-16T02:45:00.000Z");

const mocks = vi.hoisted(() => {
  const nanoidMock = vi.fn();
  const sessions = {
    id: "sessions.id",
    user_id: "sessions.user_id",
    session_token_hash: "sessions.session_token_hash",
    refresh_token_hash: "sessions.refresh_token_hash",
    device_name: "sessions.device_name",
    ip_address: "sessions.ip_address",
    session_expires_at: "sessions.session_expires_at",
    refresh_expires_at: "sessions.refresh_expires_at",
    created_at: "sessions.created_at",
  };

  const users = {
    id: "users.id",
    email: "users.email",
    name: "users.name",
    storage_used: "users.storage_used",
    storage_quota: "users.storage_quota",
    email_verified: "users.email_verified",
    created_at: "users.created_at",
  };

  return {
    nanoidMock,
    sessions,
    users,
    state: {
      insertedValues: null as Record<string, unknown> | null,
      selectedFields: null as Record<string, unknown> | null,
      selectWhereClause: null as unknown,
      selectRows: [] as unknown[],
      updateSetValues: null as Record<string, unknown> | null,
      updateWhereClause: null as unknown,
      orderByClause: null as unknown,
    },
  };
});

vi.mock("nanoid", () => ({
  nanoid: mocks.nanoidMock,
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  desc: (field: unknown) => ({ type: "desc", field }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  gte: (left: unknown, right: unknown) => ({ type: "gte", left, right }),
  ne: (left: unknown, right: unknown) => ({ type: "ne", left, right }),
}));

vi.mock("@/lib/db/schema", () => ({
  sessions: mocks.sessions,
  users: mocks.users,
}));

vi.mock("@/lib/db", () => {
  const mockDb = {
    insert: vi.fn(() => ({
      values: vi.fn(async (values) => {
        mocks.state.insertedValues = values;
      }),
    })),
    select: vi.fn((fields) => {
      mocks.state.selectedFields = fields;

      return {
        from: vi.fn(() => ({
          where: vi.fn((condition) => {
            mocks.state.selectWhereClause = condition;

            return {
              orderBy: vi.fn(async (order) => {
                mocks.state.orderByClause = order;
                return mocks.state.selectRows;
              }),
            };
          }),
          innerJoin: vi.fn(() => ({
            where: vi.fn((condition) => {
              mocks.state.selectWhereClause = condition;

              return {
                limit: vi.fn(async () => mocks.state.selectRows),
              };
            }),
          })),
        })),
      };
    }),
    update: vi.fn(() => ({
      set: vi.fn((values) => {
        mocks.state.updateSetValues = values;

        return {
          where: vi.fn(async (condition) => {
            mocks.state.updateWhereClause = condition;
          }),
        };
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  };

  return {
    MariadbConnection: {
      getConnection: () => mockDb,
    },
  };
});

import {
  createSession,
  generateSha256Hash,
  listUserSessions,
  refreshSession,
  validateRefreshToken,
  validateSession,
} from "@/lib/auth/session";

describe("auth session", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    vi.clearAllMocks();
    mocks.state.insertedValues = null;
    mocks.state.selectedFields = null;
    mocks.state.selectWhereClause = null;
    mocks.state.selectRows = [];
    mocks.state.updateSetValues = null;
    mocks.state.updateWhereClause = null;
    mocks.state.orderByClause = null;
  });

  it("stores hashed tokens, returns raw tokens, and sets exact session vs refresh expiries on createSession", async () => {
    mocks.nanoidMock
      .mockReturnValueOnce("session-token")
      .mockReturnValueOnce("refresh-token")
      .mockReturnValueOnce("session-row-id");

    const result = await createSession("user-1", {
      device_name: "Chrome on macOS",
      ip_address: "127.0.0.1",
    });

    expect(result).toEqual({
      sessionToken: "session-token",
      refreshToken: "refresh-token",
    });

    expect(mocks.state.insertedValues).toMatchObject({
      id: "session-row-id",
      user_id: "user-1",
      session_token_hash: await generateSha256Hash("session-token"),
      refresh_token_hash: await generateSha256Hash("refresh-token"),
      device_name: "Chrome on macOS",
      ip_address: "127.0.0.1",
      session_expires_at: new Date("2026-03-16T03:00:00.000Z"),
      refresh_expires_at: new Date("2026-04-15T02:45:00.000Z"),
    });
  });

  it("hashes the incoming session token during validation and checks the boundary against the current time", async () => {
    mocks.state.selectRows = [
      {
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
        storage_used: 0,
        storage_quota: 1024,
        email_verified: true,
        created_at: new Date("2026-03-16T00:00:00.000Z"),
      },
    ];

    const result = await validateSession("session-token");

    expect(result).toEqual(mocks.state.selectRows[0]);
    expect(mocks.state.selectedFields).toEqual({
      id: mocks.users.id,
      email: mocks.users.email,
      name: mocks.users.name,
      storage_used: mocks.users.storage_used,
      storage_quota: mocks.users.storage_quota,
      email_verified: mocks.users.email_verified,
      created_at: mocks.users.created_at,
    });
    expect(mocks.state.selectWhereClause).toEqual({
      type: "and",
      conditions: [
        {
          type: "eq",
          left: mocks.sessions.session_token_hash,
          right: await generateSha256Hash("session-token"),
        },
        {
          type: "gte",
          left: mocks.sessions.session_expires_at,
          right: fixedNow,
        },
      ],
    });
  });

  it("hashes the incoming refresh token during validation and checks the boundary against the current time", async () => {
    mocks.state.selectRows = [{ user_id: "user-1" }];

    await expect(validateRefreshToken("refresh-token")).resolves.toBe(true);
    expect(mocks.state.selectWhereClause).toEqual({
      type: "and",
      conditions: [
        {
          type: "eq",
          left: mocks.sessions.refresh_token_hash,
          right: await generateSha256Hash("refresh-token"),
        },
        {
          type: "gte",
          left: mocks.sessions.refresh_expires_at,
          right: fixedNow,
        },
      ],
    });
  });

  it("rotates session and refresh tokens without swapping them and resets exact expiries", async () => {
    mocks.state.selectRows = [{ user_id: "user-1" }];
    mocks.nanoidMock
      .mockReturnValueOnce("new-session-token")
      .mockReturnValueOnce("new-refresh-token");

    const result = await refreshSession("old-refresh-token");

    expect(result).toEqual({
      sessionToken: "new-session-token",
      refreshToken: "new-refresh-token",
    });

    expect(mocks.state.updateSetValues).toMatchObject({
      session_token_hash: await generateSha256Hash("new-session-token"),
      refresh_token_hash: await generateSha256Hash("new-refresh-token"),
      session_expires_at: new Date("2026-03-16T03:00:00.000Z"),
      refresh_expires_at: new Date("2026-04-15T02:45:00.000Z"),
    });
    expect(mocks.state.updateWhereClause).toEqual({
      type: "eq",
      left: mocks.sessions.refresh_token_hash,
      right: await generateSha256Hash("old-refresh-token"),
    });
  });

  it("lists only unexpired sessions for the current user ordered by newest first", async () => {
    mocks.state.selectRows = [
      {
        id: "session-1",
        device_name: "Chrome",
        ip_address: "127.0.0.1",
        session_expires_at: new Date("2026-03-16T03:00:00.000Z"),
        refresh_expires_at: new Date("2026-04-15T02:45:00.000Z"),
        created_at: new Date("2026-03-16T02:40:00.000Z"),
      },
    ];

    await expect(listUserSessions("user-1")).resolves.toEqual(mocks.state.selectRows);
    expect(mocks.state.selectWhereClause).toEqual({
      type: "and",
      conditions: [
        {
          type: "eq",
          left: mocks.sessions.user_id,
          right: "user-1",
        },
        {
          type: "gte",
          left: mocks.sessions.refresh_expires_at,
          right: fixedNow,
        },
      ],
    });
    expect(mocks.state.orderByClause).toEqual({
      type: "desc",
      field: mocks.sessions.created_at,
    });
  });

  it("returns null when refresh token validation fails", async () => {
    mocks.state.selectRows = [];

    await expect(refreshSession("expired-refresh-token")).resolves.toBeNull();
    expect(mocks.state.updateSetValues).toBeNull();
  });
});


