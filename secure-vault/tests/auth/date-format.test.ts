import { describe, expect, it } from "vitest";

import { formatDisplayDate, formatDisplayDateTime } from "@/lib/format/date";

describe("date formatting", () => {
  it("formats dates as dd/MM/yyyy", () => {
    expect(formatDisplayDate(new Date("2026-03-17T00:00:00.000Z"))).toBe("17/03/2026");
  });

  it("formats date-times as dd/MM/yyyy, HH:mm", () => {
    expect(formatDisplayDateTime(new Date(2026, 2, 17, 14, 5))).toBe("17/03/2026, 14:05");
  });
});
