import Link from "next/link";

import { ActivityFeedItem } from "@/components/activity/activity-feed-item";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityFeedPage } from "@/lib/activity/activity-types";

type ActivityPageContentProps = {
  feed: ActivityFeedPage;
  hasCursor: boolean;
};

export function ActivityPageContent({ feed, hasCursor }: ActivityPageContentProps) {
  const hasApproximateUploads = feed.entries.some((entry) => entry.occurredAtApproximate);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Activity</p>
          <h2 className="mt-2 text-3xl font-semibold">Account activity timeline</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            This feed shows recent uploads, sharing changes, and surviving share-access events for items you own.
            It is derived from current rows, so permanently purged shares disappear and renamed items can display their latest surviving label.
          </p>
        </div>

        {hasCursor ? (
          <Button asChild className="sm:self-start" variant="outline">
            <Link href="/activity">Back to newest activity</Link>
          </Button>
        ) : null}
      </div>

      {hasApproximateUploads ? (
        <Card data-testid="activity-approximate-note">
          <CardHeader>
            <CardTitle>Some older upload timestamps are approximate</CardTitle>
            <CardDescription>
              Legacy uploads fall back to file creation time when an exact completion timestamp was not stored yet.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {feed.entries.length === 0 ? (
        <Card data-testid="activity-empty-state">
          <CardHeader>
            <CardTitle>No activity yet</CardTitle>
            <CardDescription>
              Completed uploads, share creation, revocation, and share access will appear here once they happen.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This timeline reflects the current retention model, so it is helpful for recent history rather than long-term immutable audit evidence.
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="activity-feed">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Newest events appear first, with deleted targets kept readable but non-navigable while their source rows survive.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ol aria-label="Recent activity timeline" className="space-y-0">
              {feed.entries.map((entry, index) => (
                <ActivityFeedItem
                  key={entry.id}
                  entry={entry}
                  isLast={index === feed.entries.length - 1}
                />
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {feed.hasMore && feed.nextCursor ? (
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <Link href={`/activity?cursor=${encodeURIComponent(feed.nextCursor)}`}>Load older activity</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
