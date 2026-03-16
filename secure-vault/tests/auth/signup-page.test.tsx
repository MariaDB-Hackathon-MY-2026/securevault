import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useActionState: () => [undefined, vi.fn(), false] as const,
  };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import SignupPage from "@/app/(auth)/signup/page";

describe("signup page password feedback", () => {
  it("updates the visible password strength as the user types", () => {
    render(<SignupPage />);

    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /create an account/i });

    expect(screen.queryByText(/Strength:/i)).toBeNull();
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(passwordInput, { target: { value: "12345678" } });

    expect(screen.getByText(/Strength:/i).textContent).toMatch(/Strength: /);
    expect((passwordInput as HTMLInputElement).getAttribute("aria-invalid")).toBe("true");
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(passwordInput, {
      target: { value: "CorrectHorseBatteryStaple!2026" },
    });

    expect(screen.getByText("Password strength looks good.")).not.toBeNull();
    expect((passwordInput as HTMLInputElement).getAttribute("aria-invalid")).toBe("false");
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
  });
});
