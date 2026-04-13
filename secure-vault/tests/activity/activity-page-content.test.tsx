import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActivityPageContent } from "@/components/activity/activity-page-content";
import type { ActivityFeedPage } from "@/lib/activity/activity-types";

function createFeed(overrides: Partial<ActivityFeedPage> = {}): ActivityFeedPage {
  return {
    entries: [],
    hasMore: false,
    nextCursor: null,
    ...overrides,
  };
}

describe("ActivityPageContent", () => {
  it("renders an empty state for users without activity", () => {
    render(<ActivityPageContent feed={createFeed()} hasCursor={false} />);

    expect(screen.getByText("No activity yet")).toBeTruthy();
    expect(screen.getByText(/Completed uploads, share creation, revocation, and share access/i)).toBeTruthy();
  });

  it("shows truthful approximate upload messaging when legacy entries are present", () => {
    render(
      <ActivityPageContent
        feed={createFeed({
          entries: [
            {
              actorLabel: "You",
              ctaHref: null,
              ctaLabel: null,
              id: "upload_completed:file-1",
              kind: "upload_completed",
              occurredAt: "2026-04-10T10:00:00.000Z",
              occurredAtApproximate: true,
              sourceId: "file-1",
              targetId: "file-1",
              targetLabel: "report.pdf",
              targetType: "file",
            },
          ],
        })}
        hasCursor={false}
      />,
    );

    expect(screen.getByText("Some older upload timestamps are approximate")).toBeTruthy();
    expect(screen.getByText("Approximate")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Recent activity timeline" })).toBeTruthy();
  });

  it("renders non-navigable deleted rows without a CTA", () => {
    render(
      <ActivityPageContent
        feed={createFeed({
          entries: [
            {
              actorLabel: null,
              ctaHref: null,
              ctaLabel: null,
              id: "share_accessed:access-1",
              kind: "share_accessed",
              occurredAt: "2026-04-10T10:00:00.000Z",
              occurredAtApproximate: false,
              sourceId: "access-1",
              targetId: "file-1",
              targetLabel: "Deleted item",
              targetType: "file",
            },
          ],
        })}
        hasCursor={false}
      />,
    );

    expect(screen.getByText("Deleted item was accessed through a shared link.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /open/i })).toBeNull();
  });

  it("renders pagination controls when another page exists", () => {
    render(
      <ActivityPageContent
        feed={createFeed({
          entries: [
            {
              actorLabel: "You",
              ctaHref: null,
              ctaLabel: null,
              id: "share_created:link-1",
              kind: "share_created",
              occurredAt: "2026-04-10T10:00:00.000Z",
              occurredAtApproximate: false,
              sourceId: "link-1",
              targetId: "file-1",
              targetLabel: "report.pdf",
              targetType: "file",
            },
          ],
          hasMore: true,
          nextCursor: "cursor-token",
        })}
        hasCursor={true}
      />,
    );

    expect(screen.getByRole("link", { name: "Back to newest activity" }).getAttribute("href")).toBe("/activity");
    expect(screen.getByRole("link", { name: "Load older activity" }).getAttribute("href")).toBe(
      "/activity?cursor=cursor-token",
    );
  });
});
