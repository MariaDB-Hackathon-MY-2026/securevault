import { describe, expect, it } from "vitest";

import nextConfig from "@/../next.config";

describe("next config headers", () => {
  it("keeps preview routes embeddable while the global app stays frame-denied", async () => {
    const headers = await nextConfig.headers?.();

    expect(headers).toBeDefined();

    const filePreviewRule = headers?.find((rule) => rule.source === "/api/files/:id/preview");
    const sharePreviewRule = headers?.find((rule) => rule.source === "/api/share/:token/preview");
    const globalRule = headers?.find(
      (rule) =>
        rule.source === "/((?!api/files/[^/]+/preview$|api/share/[^/]+/preview$).*)",
    );

    expect(filePreviewRule?.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        expect.objectContaining({
          key: "Content-Security-Policy",
          value: expect.stringContaining("frame-ancestors 'self'"),
        }),
      ]),
    );

    expect(sharePreviewRule?.headers).toEqual(
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
