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

  it("submits the request form and keeps the continue link bound to the submitted email", async () => {
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

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "bob@example.com" },
    });

    expect(screen.getByRole("link", { name: /continue to reset password/i }).getAttribute("href")).toBe(
      "/reset-password?email=alice%40example.com",
    );
  });

  it("shows the loading state while the request is in flight", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })),
    );

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    expect(screen.getByRole("button", { name: /sending code/i }).hasAttribute("disabled")).toBe(true);

    resolveFetch?.(
      new Response(
        JSON.stringify({
          message: "If an account exists for that email, a verification code has been sent.",
          success: true,
        }),
        { status: 200 },
      ),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send verification code/i }).hasAttribute("disabled")).toBe(false);
    });
  });

  it("renders inline field errors from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        JSON.stringify({
          error: "VALIDATION_ERROR",
          fieldErrors: { email: ["Email is required"] },
          message: "Email is required",
        }),
        { status: 400 },
      )),
    );

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send verification code/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Email is required").length).toBeGreaterThan(0);
    });
  });
});
