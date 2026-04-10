import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __getResendCalls,
  __resetResendMock,
  __setResendResponse,
} from "../support/resend";

describe("email helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetResendMock();
    delete process.env.RESEND_API_KEY;
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  });

  it("logs password reset OTPs locally in non-production", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { sendPasswordResetOtpEmail } = await import("@/lib/email");

    await expect(sendPasswordResetOtpEmail("alice@example.com", "123456")).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledWith(
      "[Password Reset OTP][dev-only] To: alice@example.com, Code: 123456",
    );
    expect(__getResendCalls()).toEqual([]);
  });

  it("uses the outbound email path in production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.RESEND_API_KEY = "test-key";
    __setResendResponse({ error: null });
    const { sendPasswordResetOtpEmail } = await import("@/lib/email");

    await expect(sendPasswordResetOtpEmail("alice@example.com", "123456")).resolves.toBeUndefined();

    expect(__getResendCalls()).toEqual([
      expect.objectContaining({
        html: expect.stringContaining("SecureVault Password Reset Code"),
        subject: "Your SecureVault password reset code",
        to: "alice@example.com",
      }),
    ]);
  });

  it("escapes OTP content before inserting it into email HTML", async () => {
    const { passwordResetOtpEmailHtml } = await import("@/lib/email/templates");
    const html = passwordResetOtpEmailHtml("<123&456>");

    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("<meta charset=\"utf-8\">");
    expect(html).toContain("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
    expect(html).toContain("&lt;123&amp;456&gt;");
    expect(html).not.toContain("<div class=\"otp-code\"><123&456></div>");
  });
});
