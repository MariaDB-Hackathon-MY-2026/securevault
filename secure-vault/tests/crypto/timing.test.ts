import { safeCompare } from "@/lib/crypto/timing";

describe("safeCompare", () => {
  it("returns true for equal strings", () => {
    expect(safeCompare("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(safeCompare("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(safeCompare("abc123", "abc")).toBe(false);
  });
});
