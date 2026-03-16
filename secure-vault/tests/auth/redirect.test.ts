import { describe, expect, it } from "vitest";

import { safeRedirect } from "@/lib/auth/redirect";

describe("safeRedirect", () => {
  it("allows safe relative dashboard paths", () => {
    expect(safeRedirect("/activity")).toBe("/activity");
  });

  it("falls back for absolute URLs", () => {
    expect(safeRedirect("https://evil.com")).toBe("/activity");
  });

  it("falls back for protocol-relative URLs", () => {
    expect(safeRedirect("//evil.com")).toBe("/activity");
  });

  it("falls back for missing values", () => {
    expect(safeRedirect(undefined)).toBe("/activity");
  });
});
