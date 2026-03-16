import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastMock } = vi.hoisted(() => ({
  toastMock: {
    loading: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

import { useActionToast } from "@/hooks/use-action-toast";

function TestHarness({
  isPending,
  state,
}: {
  isPending: boolean;
  state: { error?: string } | undefined;
}) {
  useActionToast(isPending, state, {
    loadingMessage: "Working...",
    successMessage: "Done.",
    id: "test-toast",
  });

  return null;
}

describe("useActionToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dismisses the toast when the component unmounts during a pending action", () => {
    const { unmount } = render(<TestHarness isPending={true} state={undefined} />);

    expect(toastMock.loading).toHaveBeenCalledWith("Working...", { id: "test-toast" });

    unmount();

    expect(toastMock.dismiss).toHaveBeenCalledWith("test-toast");
  });

  it("shows an error toast when the action returns an error", () => {
    render(<TestHarness isPending={false} state={{ error: "Nope" }} />);

    expect(toastMock.error).toHaveBeenCalledWith("Nope", { id: "test-toast" });
  });
});
