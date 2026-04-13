import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDisplayDateTime } from "@/lib/format/date";
import type { ActivityFeedEntry } from "@/lib/activity/activity-types";

type ActivityFeedItemProps = {
  entry: ActivityFeedEntry;
  isLast: boolean;
};

export function ActivityFeedItem({ entry, isLast }: ActivityFeedItemProps) {
  return (
    <li
      className={`flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-start sm:justify-between ${isLast ? "" : "border-b border-border/60"}`}
      data-testid={`activity-entry-${entry.kind}-${entry.sourceId}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{getActivityHeading(entry)}</p>
          <Badge variant="outline">{getActivityBadgeLabel(entry)}</Badge>
          {entry.occurredAtApproximate ? <Badge variant="secondary">Approximate</Badge> : null}
        </div>

        <p className="mt-2 text-sm text-muted-foreground">{getActivityBody(entry)}</p>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-2 text-left sm:items-end sm:text-right">
        <time className="text-sm text-muted-foreground" dateTime={entry.occurredAt}>
          {formatDisplayDateTime(entry.occurredAt)}
        </time>

        {entry.ctaHref && entry.ctaLabel ? (
          <Button asChild size="sm" variant="outline">
            <Link href={entry.ctaHref}>{entry.ctaLabel}</Link>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function getActivityHeading(entry: ActivityFeedEntry) {
  switch (entry.kind) {
    case "upload_completed":
      return "Upload completed";
    case "share_created":
      return "Share link created";
    case "share_revoked":
      return "Share link revoked";
    case "share_accessed":
      return "Shared link accessed";
  }
}

function getActivityBadgeLabel(entry: ActivityFeedEntry) {
  switch (entry.targetType) {
    case "file":
      return "File";
    case "folder":
      return "Folder";
    default:
      return "Item";
  }
}

function getActivityBody(entry: ActivityFeedEntry) {
  switch (entry.kind) {
    case "upload_completed":
      return `You completed the upload for ${entry.targetLabel}.`;
    case "share_created":
      return `You created a share link for ${entry.targetLabel}.`;
    case "share_revoked":
      return `You revoked a share link for ${entry.targetLabel}.`;
    case "share_accessed":
      return entry.actorLabel
        ? `${entry.actorLabel} accessed ${entry.targetLabel}.`
        : `${entry.targetLabel} was accessed through a shared link.`;
  }
}
