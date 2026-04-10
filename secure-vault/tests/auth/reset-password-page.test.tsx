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

  it("keeps the submit button disabled until the password is strong enough and explains why", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ResetPasswordPage />);

    const submitButton = screen.getByRole("button", { name: /reset password/i });
    expect(submitButton.hasAttribute("disabled")).toBe(true);
    expect(submitButton.getAttribute("title")).toBe("Enter a strong password to enable reset");

    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "CorrectHorseBatteryStaple!2026" },
    });

    await waitFor(() => {
      expect(submitButton.hasAttribute("disabled")).toBe(false);
    });
  });

  it("renders OTP guidance for locked codes and keeps the resend control visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        JSON.stringify({
          error: "OTP_LOCKED",
          message: "Too many attempts. Please request a new verification code",
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
      expect(screen.getByText("Too many attempts. Please request a new verification code")).not.toBeNull();
    });
    expect(screen.getByText(/need a new code/i)).not.toBeNull();
    expect(screen.getByRole("button", { name: /resend code/i })).not.toBeNull();
  });

  it("renders server-returned field errors inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        JSON.stringify({
          error: "VALIDATION_ERROR",
          fieldErrors: { code: ["Verification code is required"] },
          message: "Please correct the highlighted fields.",
        }),
        { status: 400 },
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
      expect(screen.getByText("Verification code is required")).not.toBeNull();
    });
  });

  it("uses the resend action and shows the generic success state", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body && JSON.parse(String(init.body)).newPassword) {
        return new Response(
          JSON.stringify({
            error: "OTP_USED",
            message: "Verification code has already been used. Please request a new verification code.",
          }),
          { status: 403 },
        );
      }

      return new Response(
        JSON.stringify({
          message: "If an account exists for that email, a verification code has been sent.",
          success: true,
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/^verification code$/i), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: "CorrectHorseBatteryStaple!2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/need a new code/i)).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /resend code/i }));

    await waitFor(() => {
      expect(screen.getByText(/verification code sent/i)).not.toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
