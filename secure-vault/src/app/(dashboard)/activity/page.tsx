import { ActivityPageContent } from "@/components/activity/activity-page-content";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getActivityFeedForUser } from "@/lib/activity/activity-service";
import { parseActivityCursor } from "@/lib/activity/activity-types";

type ActivityPageProps = {
  searchParams?:
    | Promise<{ cursor?: string | string[] | undefined }>
    | { cursor?: string | string[] | undefined };
};

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <ActivityPageContent
        feed={{
          entries: [],
          hasMore: false,
          nextCursor: null,
        }}
        hasCursor={false}
      />
    );
  }

  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const rawCursor = Array.isArray(resolvedSearchParams.cursor)
    ? resolvedSearchParams.cursor[0]
    : resolvedSearchParams.cursor;
  const cursor = parseActivityCursor(rawCursor);
  const feed = await getActivityFeedForUser({
    cursor,
    userId: user.id,
  });

  return <ActivityPageContent feed={feed} hasCursor={Boolean(cursor)} />;
}
