import { sanitizeFilename } from "@/lib/crypto/sanitize";

describe("sanitizeFilename", () => {
  it("strips path traversal and dangerous characters", () => {
    expect(sanitizeFilename("../te<>st?.txt")).toBe("test.txt");
  });

  it("truncates names to 255 characters", () => {
    const longName = `a${"b".repeat(300)}.txt`;

    expect(sanitizeFilename(longName)).toHaveLength(255);
  });

  it("removes leading dots from hidden files", () => {
    expect(sanitizeFilename(".env")).toBe("env");
  });

  it("strips null bytes", () => {
    expect(sanitizeFilename("fi\u0000le.pdf")).toBe("file.pdf");
  });

  it("strips ASCII control characters", () => {
    expect(sanitizeFilename("fi\u0001le.pdf")).toBe("file.pdf");
  });

  it("strips zero-width spaces", () => {
    expect(sanitizeFilename("fi\u200Ble.pdf")).toBe("file.pdf");
  });
});
