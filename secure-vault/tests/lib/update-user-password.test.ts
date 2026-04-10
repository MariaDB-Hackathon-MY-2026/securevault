import { beforeEach, describe, expect, it, vi } from "vitest";

import { MariadbConnection } from "@/lib/db";
import { updateUserPassword } from "@/lib/db/crud/user/update-user-password";

describe("updateUserPassword", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts tuple-shaped MariaDB update results", async () => {
    const where = vi.fn(async () => [{ affectedRows: 1 }, null]);
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue({ update } as never);

    await expect(
      updateUserPassword("user-123", "hashed-password"),
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("throws when the update really affects zero rows", async () => {
    const where = vi.fn(async () => [{ affectedRows: 0 }, null]);
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));

    vi.spyOn(MariadbConnection, "getConnection").mockReturnValue({ update } as never);

    await expect(
      updateUserPassword("missing-user", "hashed-password"),
    ).rejects.toThrow("Password update affected 0 rows for userId=missing-user");
  });
});
