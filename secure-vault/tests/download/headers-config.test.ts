import { describe, expect, it } from "vitest";

import nextConfig from "@/../next.config";

describe("next config headers", () => {
  it("keeps the preview route embeddable while the global app stays frame-denied", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers).toBeDefined();

    const previewRule = headers?.find((rule) => rule.source === "/api/files/:id/preview");
    const globalRule = headers?.find(
      (rule) => rule.source === "/((?!api/files/[^/]+/preview$).*)",
    );

    expect(previewRule?.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        expect.objectContaining({
          key: "Content-Security-Policy",
          value: expect.stringContaining("frame-ancestors 'self'"),
        }),
      ]),
    );

    expect(globalRule?.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Frame-Options", value: "DENY" },
        expect.objectContaining({
          key: "Content-Security-Policy",
          value: expect.stringContaining("frame-ancestors 'none'"),
        }),
      ]),
    );
  });
});
