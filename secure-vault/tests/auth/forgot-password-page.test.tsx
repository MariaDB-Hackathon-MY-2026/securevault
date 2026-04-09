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

import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";

describe("forgot password page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("submits the request form and renders the generic success state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        JSON.stringify({
          message: "If an account exists for that email, a verification code has been sent.",
          success: true,
        }),
        { status: 200 },
      )),
    );

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    await waitFor(() => {
      expect(screen.getByText(/verification code requested/i)).not.toBeNull();
    });
    expect(screen.getByRole("link", { name: /continue to reset password/i })).not.toBeNull();
  });
});
