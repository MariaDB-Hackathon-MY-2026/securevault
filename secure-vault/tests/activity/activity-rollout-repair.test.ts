import { describe, expect, it } from "vitest";

import { UPLOAD_COMPLETION_REPAIR_SQL } from "@/lib/activity/activity-service";

describe("activity rollout repair SQL", () => {
  it("only backfills ready rows that are still missing upload_completed_at", () => {
    expect(UPLOAD_COMPLETION_REPAIR_SQL).toContain("status = 'ready'");
    expect(UPLOAD_COMPLETION_REPAIR_SQL).toContain("upload_completed_at IS NULL");
  });
});
