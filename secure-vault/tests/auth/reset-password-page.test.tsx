import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("email=alice@example.com"),
}));

import ResetPasswordPage from "@/app/(auth)/reset-password/page";

describe("reset password page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders API errors and keeps the resend control visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        JSON.stringify({
          error: "OTP_EXPIRED",
          message: "Verification code has expired",
        }),
        { status: 403 },
      )),
    );

    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/^verification code$/i), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "CorrectHorseBatteryStaple!2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText("Verification code has expired")).not.toBeNull();
    });
    expect(screen.getByRole("button", { name: /resend code/i })).not.toBeNull();
  });
});
