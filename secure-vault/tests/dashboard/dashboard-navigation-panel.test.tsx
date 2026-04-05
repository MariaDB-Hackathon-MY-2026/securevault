import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardNavigationPanel } from "@/components/dashboard/dashboard-navigation-panel";

const mocks = vi.hoisted(() => ({
  logoutAction: vi.fn(),
  useTrashSummaryQuery: vi.fn(),
}));

vi.mock("@/app/(dashboard)/actions", () => ({
  logoutAction: mocks.logoutAction,
}));

vi.mock("@/hooks/use-trash-summary-query", () => ({
  useTrashSummaryQuery: mocks.useTrashSummaryQuery,
}));

describe("DashboardNavigationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const user = {
    created_at: "2026-04-01T00:00:00.000Z",
    email: "user@example.com",
    email_verified: true,
    id: "user-1",
    name: "User",
    storage_quota: 10_000,
    storage_used: 2_000,
  };

  it("shows the trash badge when the summary count is non-zero", () => {
    mocks.useTrashSummaryQuery.mockReturnValue({
      data: { rootFileCount: 1, rootFolderCount: 1, totalRootItemCount: 2 },
    });

    render(<DashboardNavigationPanel pathname="/files" user={user} />);

    expect(screen.getByText("2")).toBeTruthy();
  });

  it("hides the trash badge when the summary count is zero", () => {
    mocks.useTrashSummaryQuery.mockReturnValue({
      data: { rootFileCount: 0, rootFolderCount: 0, totalRootItemCount: 0 },
    });

    render(<DashboardNavigationPanel pathname="/files" user={user} />);

    expect(screen.queryByText("0")).toBeNull();
  });
});
